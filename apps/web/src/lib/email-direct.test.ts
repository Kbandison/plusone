import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendDirectEmail } from "./email";

/**
 * The direct sender waits out a rate limit rather than spending somebody's turn.
 *
 * Every caller claims before it sends, so a failed send has already used up
 * that person's reminder, invitation or nudge. A 429 is the one failure certain
 * to clear by itself — and the nudge cron sends a whole timezone in one run.
 * Behaviour, not source: fetch is faked and the clock is driven, so these fail
 * if the retry stops happening rather than if it is spelled differently.
 */
describe("sendDirectEmail and a rate limit", () => {
  const message = { to: "someone@example.invalid", subject: "s", text: "t" };
  const reply = (status: number, retryAfter?: string) =>
    new Response("{}", { status, headers: retryAfter ? { "retry-after": retryAfter } : {} });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("RESEND_FROM", "Plus One <support@example.invalid>");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function run(replies: Response[]) {
    const fetch = vi.fn();
    for (const r of replies) fetch.mockResolvedValueOnce(r);
    vi.stubGlobal("fetch", fetch);
    const sent = sendDirectEmail(message);
    await vi.runAllTimersAsync();
    return { ok: await sent, calls: fetch.mock.calls.length };
  }

  it("sends once when Resend takes it", async () => {
    expect(await run([reply(200)])).toEqual({ ok: true, calls: 1 });
  });

  it("waits out a 429 and sends", async () => {
    expect(await run([reply(429, "1"), reply(200)])).toEqual({ ok: true, calls: 2 });
  });

  it("gives up after two retries, so a quota 429 cannot hold a run open", async () => {
    expect(await run([reply(429), reply(429), reply(429), reply(200)])).toEqual({
      ok: false,
      calls: 3,
    });
  });

  it("does not retry anything that is not a rate limit", async () => {
    expect(await run([reply(422), reply(200)])).toEqual({ ok: false, calls: 1 });
    expect(await run([reply(500), reply(200)])).toEqual({ ok: false, calls: 1 });
  });

  it("honours retry-after when it asks for less than the cap", async () => {
    // Without this case a fixed two-second wait would pass everything here.
    const fetch = vi.fn().mockResolvedValueOnce(reply(429, "1")).mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetch);
    const sent = sendDirectEmail(message);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await sent).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("honours retry-after, capped at two seconds", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(429, "30")).mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetch);
    const sent = sendDirectEmail(message);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await sent).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
