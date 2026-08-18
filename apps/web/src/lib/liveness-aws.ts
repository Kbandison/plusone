import "server-only";

import {
  CreateFaceLivenessSessionCommand,
  GetFaceLivenessSessionResultsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import { GetFederationTokenCommand, STSClient } from "@aws-sdk/client-sts";

import type { verification } from "@plusone/logic";

/**
 * AWS Rekognition Face Liveness (§4.2, Decision #21).
 *
 * Face Liveness proves a live human is present. It does NOT prove which human —
 * there is no face collection, no matching, and nothing here ever learns a name.
 * That is the whole reason it was chosen over Stripe Identity, whose selfie
 * check matches against an uploaded government ID (see env.ts).
 *
 * Three structural properties this file exists to hold:
 *
 *   1. NO IMAGE SURVIVES THIS FUNCTION. GetFaceLivenessSessionResults returns a
 *      `ReferenceImage` with Base64 bytes whether you ask for it or not. Two
 *      scalars are read off the response — Status and Confidence — and the
 *      response object itself is never returned, stored, or logged. §4.2 says
 *      keep a boolean and a score; `LivenessOutcome` has no field that could
 *      hold anything else, so this cannot be forgotten, only deliberately
 *      undone.
 *
 *   2. NOTHING IS WRITTEN TO S3. `OutputConfig` is not set, so AWS has nowhere
 *      to put reference or audit images, and `AuditImagesLimit` is left at its
 *      default of 0. The purge job is a belt on top of braces rather than the
 *      only thing standing between us and a bucket of members' faces.
 *
 *   3. THE BROWSER GETS ONE PERMISSION FOR FIFTEEN MINUTES. The liveness video
 *      streams from the member's device straight to AWS, so the device needs
 *      credentials. `vendBrowserCredentials` federates down to a single action —
 *      StartFaceLivenessSession — because credentials that could also call
 *      GetFaceLivenessSessionResults would let a member read other people's
 *      results by guessing session ids.
 */

export interface AwsLivenessConfig {
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

function rekognition(config: AwsLivenessConfig): RekognitionClient {
  return new RekognitionClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/** AWS reports confidence on 0–100; `LivenessOutcome.score` is 0–1. */
export function normalizeConfidence(confidence: number | undefined): number {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return 0;
  return Math.min(1, Math.max(0, confidence / 100));
}

/**
 * AWS's own verdict, which is only half the decision.
 *
 * The seam pairs a provider verdict with a raw score precisely so the accept
 * threshold lives in `packages/logic` and not in the vendor — SUCCEEDED here
 * still has to clear `minScore` there before anybody is verified.
 */
export function passedFromStatus(status: string | undefined): boolean {
  return status === "SUCCEEDED";
}

/**
 * Whether AWS has finished deciding.
 *
 * CREATED and IN_PROGRESS are not verdicts, and reading them as one is how a
 * member who passed the check was recorded as having failed it. The analysis
 * runs after the browser stops streaming, so the result is frequently not ready
 * at the moment `onAnalysisComplete` fires — AWS documents polling until the
 * status becomes terminal, and this is the predicate that says when to stop.
 */
export function isTerminalStatus(status: string | undefined): boolean {
  return status === "SUCCEEDED" || status === "FAILED" || status === "EXPIRED";
}

/** Roughly seven seconds of polling. Analysis normally settles in one or two. */
const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 700;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAwsLivenessProvider(
  config: AwsLivenessConfig,
): verification.LivenessProvider {
  return {
    name: "aws_rekognition",

    async createSession(): Promise<verification.LivenessSession> {
      const client = rekognition(config);
      // No Settings at all: no OutputConfig means no S3 destination, and
      // AuditImagesLimit defaults to 0. Property 2.
      const response = await client.send(new CreateFaceLivenessSessionCommand({}));

      if (!response.SessionId) {
        throw new Error("Rekognition returned no SessionId");
      }

      return { sessionId: response.SessionId, provider: "aws_rekognition" };
    },

    async fetchOutcome(sessionId: string): Promise<verification.LivenessOutcome> {
      const client = rekognition(config);

      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        const response = await client.send(
          new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId }),
        );

        if (isTerminalStatus(response.Status)) {
          // Numbers only, no member and no image. The one thing that made
          // "your webcam is blurry" and "we read the result too early"
          // indistinguishable was having nothing to look at.
          //
          // This used to be gated to NODE_ENV !== "production", which put the
          // one diagnostic that can tell those apart in the only place nobody
          // is failing checks. A member reporting "good phone camera, good
          // light, still fails" is unanswerable without it: FAILED means the
          // session or the challenge went wrong at AWS, while SUCCEEDED with a
          // Confidence under our floor means AWS was satisfied and WE said no.
          // Those have opposite fixes and the member sees the same screen.
          //
          // Safe to emit anywhere: Status is an enum, Confidence is a float,
          // polls is an integer. No user id, no session id, no image, nothing
          // that says who this was or what condition they live with.
          console.info(
            JSON.stringify({
              at: "liveness.aws",
              status: response.Status,
              confidence: response.Confidence ?? null,
              polls: attempt + 1,
            }),
          );

          // `response` also holds ReferenceImage — Base64 bytes of the member's
          // face. It stops here. Do not return it, log it, or widen this object.
          return {
            passed: passedFromStatus(response.Status),
            score: normalizeConfidence(response.Confidence),
          };
        }

        await wait(POLL_INTERVAL_MS);
      }

      // Deliberately a throw, not a failed outcome.
      //
      // "We never found out" is not "you did not pass". Returning
      // `{ passed: false }` here would spend one of three attempts on our own
      // impatience and, three times over, hand a member to a human for it. The
      // caller turns this into a retryable error, and the reducer never runs.
      throw new Error("Face Liveness did not reach a verdict in time");
    },
  };
}

/** What the member's browser needs to stream its video to AWS. */
export interface BrowserCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken: string;
  readonly expiration: string;
}

/** Long enough for a check that takes seconds; short enough not to matter if it leaks. */
const BROWSER_CREDENTIAL_SECONDS = 900;

/**
 * Temporary credentials for the member's device, scoped to exactly one action.
 *
 * GetFederationToken grants the INTERSECTION of this inline policy and the
 * calling identity's own permissions, so the result can only ever be narrower
 * than the server's. The server may create sessions and read results; what
 * leaves this function may only start a stream.
 *
 * Chosen over a Cognito identity pool deliberately: the Amplify default vends
 * browser credentials from a public unauthenticated endpoint, and this app has
 * no reason to run one. These credentials are only ever minted for a member who
 * is already signed in and phone-verified.
 */
export async function vendBrowserCredentials(
  config: AwsLivenessConfig,
): Promise<BrowserCredentials> {
  const sts = new STSClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const response = await sts.send(
    new GetFederationTokenCommand({
      // 2–32 chars, and it shows up in CloudTrail. Deliberately says nothing
      // about which member: §8's rule about identity in payloads applies to
      // logs we do not own too.
      Name: "plusone-liveness",
      DurationSeconds: BROWSER_CREDENTIAL_SECONDS,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "StreamOnly",
            Effect: "Allow",
            Action: "rekognition:StartFaceLivenessSession",
            Resource: "*",
          },
        ],
      }),
    }),
  );

  const credentials = response.Credentials;
  if (
    !credentials?.AccessKeyId ||
    !credentials.SecretAccessKey ||
    !credentials.SessionToken ||
    !credentials.Expiration
  ) {
    throw new Error("STS returned incomplete federation credentials");
  }

  return {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.SessionToken,
    expiration: credentials.Expiration.toISOString(),
  };
}
