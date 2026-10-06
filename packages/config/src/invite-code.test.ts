import { describe, expect, it } from "vitest";

import { formatInviteCode, inviteCodeLine, parseInviteCode } from "./waitlist";

/**
 * BACKLOG 32: an invitation typed rather than followed, so it reaches the
 * iPhone app that the email link never opens in.
 */
const CODE = "3f9a1c2b77d0e4a1";

describe("an invitation code a person can read and type", () => {
  it("reads in groups of four, upper case", () => {
    expect(formatInviteCode(CODE)).toBe("3F9A 1C2B 77D0 E4A1");
  });

  it("comes back from exactly what it was shown as", () => {
    expect(parseInviteCode(formatInviteCode(CODE))).toBe(CODE);
  });

  it("forgives case, spaces, dashes and padding", () => {
    for (const typed of [
      "3F9A1C2B77D0E4A1",
      "3f9a-1c2b-77d0-e4a1",
      "  3F9A 1C2B\t77D0 E4A1 ",
      "3f9a 1C2B-77d0E4A1",
    ]) {
      expect(parseInviteCode(typed), typed).toBe(CODE);
    }
  });

  /** Long-press, Copy Link, paste: the easiest way to get it on a phone. */
  it("takes a whole pasted invitation link", () => {
    expect(parseInviteCode(`https://www.loveplusone.app/beta/${CODE}`)).toBe(CODE);
    expect(parseInviteCode(`https://www.loveplusone.app/beta/${CODE.toUpperCase()}?x=1`)).toBe(
      CODE,
    );
  });

  it("refuses anything that is not sixteen hex characters", () => {
    for (const typed of [
      "",
      "3f9a1c2b77d0e4a",
      "3f9a1c2b77d0e4a1f",
      "3f9a1c2b77d0e4ag",
      "/beta/3f9a1c2b77d0e4a1f",
      "drop table waitlist",
    ]) {
      expect(parseInviteCode(typed), typed).toBeNull();
    }
  });

  it("puts the readable code in the email line", () => {
    expect(inviteCodeLine(CODE)).toContain("3F9A 1C2B 77D0 E4A1");
  });
});
