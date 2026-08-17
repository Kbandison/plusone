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
  /**
   * Now reads NOTHING from the form. The session id used to be posted from the
   * page, which let one member submit another's id and claim their AWS verdict
   * — one live face verifying unlimited accounts. It comes off the member's own
   * row instead, so there is no field left to forge.
   */
  it("reads nothing at all from the request body", () => {
    const fields = [...code.matchAll(/formData\.get\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(fields).toEqual([]);
  });

  it("takes the session id from the row and consumes it", () => {
    expect(code).toMatch(/const sessionId = current\.sessionId/);
    expect(code).toMatch(/liveness_session_id: null/);
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
    expect(formCode).toMatch(/if \(state\.review\)/);
  });

  it("starts with no review, because nothing has been asked yet", async () => {
    const { LIVENESS_INITIAL } = await import("./state");
    expect(LIVENESS_INITIAL.review).toBeNull();
    expect(LIVENESS_INITIAL.session).toBeNull();
  });

  it("only ever sets a review from the reducer, the cap, or a refusal", () => {
    // Every `review:` assignment must come from a status the SERVER read, never
    // from anything the browser sent.
    for (const m of code.matchAll(/review:\s*([\s\S]{0,120}?)(,\n|\n\s*\})/g)) {
      const value = (m[1] ?? "").trim();
      if (value === "null") continue;
      expect(
        value.includes("current") || value.includes("next."),
        `review derived from ${value}`,
      ).toBe(true);
    }
  });
});

describe("a flagged member is never told to try again", () => {
  const form = readFileSync(fileURLToPath(new URL("./liveness-form.tsx", import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  /**
   * What Kevin hit after three real failures. `finishLiveness` flagged him and
   * returned `error: null, flagged: true` — and the form picked between its two
   * action states by asking whether finish had an ERROR. It had not, so the
   * flagged result was discarded, the stale begin state rendered a retry
   * button, and pressing it hit the reducer's `under_review` refusal, which
   * this file collapsed into "the check is unavailable right now".
   *
   * A member handed to a human, told to try again, forever.
   */
  it("picks the live phase explicitly, not by whether an error is set", () => {
    expect(form).not.toMatch(/finished\.error\s*!==\s*null/);
    expect(form).toMatch(/finished\.phase\s*!==\s*"idle"/);
  });

  /**
   * Decision #21: manual review only on a risk flag, and the appeal path is
   * never locked behind the thing being appealed. "Try again in a moment" on a
   * check that will refuse forever is that lock.
   */
  it("routes under_review to the review screen, not to an error", () => {
    const begin = code.slice(
      code.indexOf("export async function beginLiveness"),
      code.indexOf("export async function finishLiveness"),
    );
    expect(begin).toMatch(/started\.code === "under_review"/);
    const branch = begin.slice(begin.indexOf('started.code === "under_review"'));
    // And it must distinguish rejected from flagged: "somebody will look" is
    // false for a member an administrator has already refused.
    expect(branch.slice(0, 400)).toMatch(/current\.status === "rejected"/);
  });

  /**
   * `...previous` carries the count from a phase ago. The refusal branch showed
   * "1 attempt left" to a member with none — the same screenshot that started
   * this, where the number and the reality disagreed.
   */
  it("recomputes the attempt count on the refusal branch", () => {
    const begin = code.slice(
      code.indexOf("export async function beginLiveness"),
      code.indexOf("export async function finishLiveness"),
    );
    const refusal = begin.slice(
      begin.indexOf("if (!started.ok)"),
      begin.indexOf("// Out of attempts"),
    );
    expect(refusal, "the count must come from the row, not from ...previous").toMatch(
      /attemptsLeft:\s*attemptsLeftFor\(current\)/,
    );
    expect(refusal, "the phoneFirst branch is still reachable").toMatch(/E\.phoneFirst/);
  });
});

describe("a misconfigured provider is not a 500 in a member's face", () => {
  /**
   * createStubLivenessProvider throws when NODE_ENV is "production" — correctly,
   * because a provider that always passes is the fake-profile problem this
   * pipeline exists to prevent, and shipping one by accident has to be loud.
   *
   * But the call sat outside the try, so a deployment still set to `stub` met a
   * member at step 2 of signing up with an unhandled error rather than a
   * sentence. Loud belongs in the logs, where whoever misconfigured it looks.
   */
  it("catches the stub's production refusal and returns null", () => {
    const provider = code.slice(
      code.indexOf("function providerFor"),
      code.indexOf("export async function beginLiveness"),
    );
    expect(provider).toMatch(/try \{[\s\S]*?createStubLivenessProvider\(\)/);
    expect(provider).toMatch(/return null/);
    expect(provider, "and says so somewhere an operator will see it").toMatch(/console\.error/);
  });

  it("still refuses to run — null means the member is told it is unavailable", () => {
    expect(code).toMatch(/if \(!provider\) return \{ \.\.\.previous, error: E\.unavailable/);
  });
});
