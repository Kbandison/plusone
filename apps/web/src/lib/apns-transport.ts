/**
 * The APNs wire: configuration, the provider token, and the send itself.
 *
 * Split out of apns.ts on 2026-08-26 for a reason that turned out to matter.
 * That file opens with `import "server-only"`, which throws anywhere outside a
 * React Server Component — so `pnpm push:test`, the one operator tool for
 * proving the whole chain, could not import any of this and silently skipped
 * every `ios` row. The tool for testing push could not test push.
 *
 * Nothing here reads a database or a request. It takes a config, a list of
 * device tokens and an alert, and reports what Apple said. The notifier keeps
 * everything that needs a server: which members to reach, and what a status
 * means for the row behind the token.
 */
import { sign } from "node:crypto";
import { connect, constants } from "node:http2";

/**
 * Apple rejects a provider token older than an hour and rate-limits how often
 * you may mint one. Forty-five minutes leaves room for a slow batch without
 * ever presenting a stale token.
 */
const TOKEN_TTL_MS = 45 * 60 * 1000;

/** Module-level, so a warm instance reuses the token across invocations. */
let cached: { token: string; mintedAt: number } | null = null;

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url").replace(/=+$/, "");

interface ApnsConfig {
  readonly keyId: string;
  readonly teamId: string;
  readonly bundleId: string;
  readonly privateKey: string;
  readonly host: string;
}

/**
 * The configuration, or nothing.
 *
 * All four values or none — a partial set cannot send and would fail per
 * message rather than at the seam. `notifier()` uses the same shape to decide
 * whether to build this at all, so reaching here without it means the
 * environment changed under a running process.
 *
 * The key is the .p8 file's contents, newlines and all. Vercel's environment
 * editor keeps them; a shell `export` usually does not, which is why
 * `\n` is accepted and rewritten.
 */
function configure(): ApnsConfig | null {
  const keyId = process.env["APNS_KEY_ID"];
  const teamId = process.env["APNS_TEAM_ID"];
  const bundleId = process.env["APNS_BUNDLE_ID"];
  const privateKey = process.env["APNS_PRIVATE_KEY"];
  if (!keyId || !teamId || !bundleId || !privateKey) return null;

  return {
    keyId,
    teamId,
    bundleId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    // Sandbox is a different host, not a flag. A token minted by a development
    // build is meaningless to production and answers 400 BadDeviceToken, which
    // is the single most common way this looks broken when it is not.
    host:
      process.env["APNS_ENVIRONMENT"] === "sandbox"
        ? "https://api.sandbox.push.apple.com"
        : "https://api.push.apple.com",
  };
}

/**
 * The provider token: an ES256 JWT, signed with the .p8 key.
 *
 * Hand-rolled rather than pulled from a library because it is three fields and
 * a signature, and the one thing worth getting right is the encoding. JOSE
 * wants the raw `r || s` pair, 64 bytes for P-256; Node's default for an EC key
 * is DER, which Apple rejects with a 403 that says only "InvalidProviderToken".
 * `dsaEncoding: "ieee-p1363"` is the whole fix.
 */
export function providerToken(config: ApnsConfig, now: number = Date.now()): string {
  if (cached && now - cached.mintedAt < TOKEN_TTL_MS) return cached.token;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }));
  const signature = sign(null, Buffer.from(`${header}.${claims}`), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  });

  const token = `${header}.${claims}.${base64url(signature)}`;
  cached = { token, mintedAt: now };
  return token;
}

/** Only for tests, which must not inherit a token minted by another case. */
export function resetProviderToken(): void {
  cached = null;
}

/** What Apple said about one device. The caller decides what it means. */
export interface ApnsResult {
  readonly deviceToken: string;
  readonly status: number;
}

/** The content-blind alert, already checked by the caller. */
export interface ApnsAlert {
  readonly title: string;
  readonly body: string;
  /** Also the collapse id — it names a kind of thing, never a person. */
  readonly event: string;
  readonly path: string;
  readonly sound: boolean;
}

export { configure as apnsConfig };
export type { ApnsConfig };

/**
 * Sends to every device in one HTTP/2 session and reports each status.
 *
 * ── why this is not a fetch ──────────────────────────────────────────────────
 *
 * APNs speaks HTTP/2 and refuses 1.1, and Node's `fetch` is undici, which is
 * 1.1 only. So `node:http2` directly. That is the entire reason this looks
 * heavier than email.ts, which is a single POST.
 *
 * One session per batch, closed at the end. A long-lived session is the right
 * shape for a server that stays up and the wrong one for an invocation that
 * does not; this runs behind a cron, an action, or a script, all of which are
 * about to exit.
 *
 * Nothing is added to the payload here — no name, no preview, no count.
 */
export async function sendApnsAlerts(
  config: ApnsConfig,
  targets: readonly { readonly deviceToken: string; readonly alert: ApnsAlert }[],
): Promise<ApnsResult[]> {
  if (targets.length === 0) return [];

  const token = providerToken(config);
  const session = connect(config.host);
  session.on("error", () => {
    /* Reported per request below; a session error would otherwise be unhandled. */
  });

  try {
    return await Promise.all(
      targets.map(async ({ deviceToken, alert }) => {
        const body = JSON.stringify({
          aps: {
            alert: { title: alert.title, body: alert.body },
            // Everything else arrives quietly, exactly as in sw.js.
            ...(alert.sound ? { sound: "default" } : {}),
          },
          // Read by the shell when the notification is tapped.
          path: alert.path,
        });

        const status = await new Promise<number>((resolve) => {
          const request = session.request({
            [constants.HTTP2_HEADER_METHOD]: "POST",
            [constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
            authorization: `bearer ${token}`,
            "apns-topic": config.bundleId,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "apns-collapse-id": alert.event,
          });
          request.setEncoding("utf8");
          request.on("response", (headers) =>
            resolve(Number(headers[constants.HTTP2_HEADER_STATUS]) || 0),
          );
          request.on("error", () => resolve(0));
          request.end(body);
        });

        return { deviceToken, status };
      }),
    );
  } finally {
    session.close();
  }
}
