import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./actions.ts", import.meta.url)), "utf8");
/** Comments discuss these properties at length; strip them before matching. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("the attempt count is not the member's to keep", () => {
  /**
   * The regression this guards. `livenessAttempts` was computed from
   * `previous.attemptsLeft` — action state React sends from the browser with
   * nothing signing it. A crafted request bought unlimited tries at the check
   * the whole product rests on, never triggered the human-review path, and
   * (once a paid provider was wired up) made every retry an unbounded charge.
   */
  it("never reads attempts out of the action state", () => {
    expect(code).not.toMatch(/previous\.attemptsLeft/);
    expect(code).not.toMatch(/livenessMaxRetries\s*-\s*previous/);
  });

  it("reads them from the row instead", () => {
    expect(code).toMatch(/liveness_attempts/);
    expect(code).toMatch(/from\("profiles"\)/);
  });

  /**
   * One counter, and it is the reducer's.
   *
   * beginLiveness used to increment the column and then hand the incremented
   * value to the reducer, which adds one of its own. Two counters over one
   * event: members were flagged for human review after two checks instead of
   * three. Kevin hit it on his second click.
   *
   * It also charged anyone whose camera never opened — on a desktop with no
   * webcam, that is everyone.
   */
  it("does not count the attempt when the session opens", () => {
    const begin = code.slice(
      code.indexOf("export async function beginLiveness"),
      code.indexOf("export async function finishLiveness"),
    );
    expect(begin).not.toMatch(/liveness_attempts/);
    expect(begin).not.toMatch(/attempts \+ 1/);
  });

  it("persists the reducer's own count when the result lands", () => {
    const finish = code.slice(code.indexOf("export async function finishLiveness"));
    expect(finish).toMatch(/liveness_attempts:\s*next\.livenessAttempts/);
  });

  it("counts liveness_attempts in exactly one place", () => {
    const writes = [...code.matchAll(/liveness_attempts:/g)];
    expect(writes.length, "a second writer is a second counter").toBe(1);
  });

  it("refuses to open a session once the cap is reached", () => {
    expect(code).toMatch(/current\.attempts >= VERIFICATION\.livenessMaxRetries/);
  });
});

describe("the browser does not get to say what happened", () => {
  it("takes only a session id from the form, never a verdict", () => {
    const fields = [...code.matchAll(/formData\.get\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(fields).toEqual(["session_id"]);
  });

  /**
   * The verdict is fetched from AWS against the session id. If `passed` or
   * `score` were ever read off the request, a member could verify themselves
   * with a curl command — which is the same hole the column grant closed for
   * verification_status.
   */
  it("never reads an outcome out of the request", () => {
    expect(code).not.toMatch(/formData\.get\("(passed|score|status|confidence)"\)/i);
    expect(code).toMatch(/provider\.fetchOutcome\(sessionId\)/);
  });

  it("writes verification_status only with the service client", () => {
    const writes = [...code.matchAll(/verification_status:/g)];
    expect(writes.length).toBeGreaterThan(0);
    for (const match of writes) {
      const before = code.slice(Math.max(0, match.index! - 400), match.index!);
      expect(before, "a verification_status write not preceded by serviceClient()").toMatch(
        /serviceClient\(\)/,
      );
    }
  });
});

describe("no image leaves the adapter", () => {
  const adapter = readFileSync(
    fileURLToPath(new URL("../../../lib/liveness-aws.ts", import.meta.url)),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  /**
   * GetFaceLivenessSessionResults returns a Base64 ReferenceImage whether asked
   * or not. §4.2 keeps a boolean and a score; if either of these appears the
   * member's face has started travelling somewhere it should not.
   */
  it("never touches ReferenceImage or AuditImages", () => {
    expect(adapter).not.toMatch(/ReferenceImage/);
    expect(adapter).not.toMatch(/AuditImages/);
  });

  it("asks AWS for no S3 output and no audit images", () => {
    expect(adapter).not.toMatch(/OutputConfig/);
    expect(adapter).not.toMatch(/AuditImagesLimit/);
  });

  it("vends the browser exactly one action", () => {
    expect(adapter).toMatch(/Action:\s*"rekognition:StartFaceLivenessSession"/);
    expect(adapter).not.toMatch(/Action:\s*\[/);
  });
});

describe("the review screen is the server's call", () => {
  const form = readFileSync(fileURLToPath(new URL("./liveness-form.tsx", import.meta.url)), "utf8");
  const formCode = form.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  /**
   * The regression Kevin hit on the very first run. `attemptsLeft` moved to the
   * server, so the initial state honestly said "0 left, I have not asked yet" —
   * and the form read 0 as "flagged for human review". Every member met "We
   * will take a look" before pressing anything, having done nothing wrong.
   */
  it("does not infer flagged from an attempt count", () => {
    expect(formCode).not.toMatch(/attemptsLeft\s*===\s*0/);
    expect(formCode).toMatch(/if \(state\.flagged\)/);
  });

  it("starts un-flagged, because nothing has been asked yet", async () => {
    const { LIVENESS_INITIAL } = await import("./state");
    expect(LIVENESS_INITIAL.flagged).toBe(false);
    expect(LIVENESS_INITIAL.session).toBeNull();
  });

  it("only ever sets flagged from the reducer or the cap", () => {
    const sets = [...code.matchAll(/flagged:\s*([^,\n]+)/g)].map((m) => (m[1] ?? "").trim());
    for (const value of sets) {
      expect(
        value === "true" || value === "false" || value.includes('next.status === "flagged"'),
        `flagged set from ${value}`,
      ).toBe(true);
    }
  });
});
