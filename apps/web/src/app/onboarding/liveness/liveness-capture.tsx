"use client";

import { FaceLivenessDetectorCore } from "@aws-amplify/ui-react-liveness";
import "@aws-amplify/ui-react/styles.css";

import type { BrowserCredentials } from "@/lib/liveness-aws";

/**
 * The camera step.
 *
 * Split into its own module so `next/dynamic` can keep it out of the main
 * bundle — it pulls in the Amplify UI runtime and a video pipeline, and nobody
 * on any other screen should pay for that.
 *
 * `FaceLivenessDetectorCore`, not `FaceLivenessDetector`: the latter reaches for
 * Amplify Auth and a Cognito identity pool. Core takes a credentialProvider,
 * which is what lets this app vend its own — see vendBrowserCredentials, which
 * federates down to StartFaceLivenessSession alone.
 */
export function LivenessCapture({
  sessionId,
  region,
  credentials,
  onComplete,
  onFailed,
  onCancel,
}: {
  sessionId: string;
  region: string;
  credentials: BrowserCredentials;
  onComplete: () => void;
  onFailed: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-line-2">
      <FaceLivenessDetectorCore
        sessionId={sessionId}
        region={region}
        // Called once at the start of the flow with no refresh, which is why
        // these are minted for fifteen minutes rather than for seconds.
        config={{
          credentialProvider: () =>
            Promise.resolve({
              accessKeyId: credentials.accessKeyId,
              secretAccessKey: credentials.secretAccessKey,
              sessionToken: credentials.sessionToken,
              expiration: new Date(credentials.expiration),
            }),
        }}
        // The component signals only that analysis FINISHED. It does not say
        // whether it passed, and it is not asked to: the verdict is read from
        // AWS server-side against this session id.
        onAnalysisComplete={async () => {
          onComplete();
        }}
        onError={onFailed}
        onUserCancel={onCancel}
      />
    </div>
  );
}
