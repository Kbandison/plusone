import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DRAFT_COPY } from "@plusone/config";

const set = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ set }) }));
const isOpen = vi.fn<(code: string | undefined) => Promise<boolean>>();
vi.mock("@/lib/waitlist", () => ({ betaInviteIsOpen: (code: string) => isOpen(code) }));

import { BETA_COOKIE, BETA_COOKIE_OPTIONS } from "@/lib/beta-cookie";
import { attachInviteCode } from "./invite-actions";
import { INVITE_CODE_INITIAL } from "./state";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const noComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");

const CODE = "3f9a1c2b77d0e4a1";
const typed = (value: string) => {
  const form = new FormData();
  form.set("invite_code", value);
  return attachInviteCode(INVITE_CODE_INITIAL, form);
};

/**
 * BACKLOG 32. Nobody who signed up in the iPhone app was ever marked as a beta
 * tester: the email link opens Safari, and the app keeps its own cookies. The
 * code typed on the signup screen sets the same cookie the link would have, in
 * the app they are actually signing up in.
 */
describe("typing an invitation code", () => {
  beforeEach(() => {
    set.mockReset();
    isOpen.mockReset();
  });

  it("attaches an open invitation with the very cookie the link sets", async () => {
    isOpen.mockResolvedValue(true);
    expect(await typed("3F9A 1C2B 77D0 E4A1")).toEqual({ attached: true, error: null });
    expect(isOpen).toHaveBeenCalledWith(CODE);
    expect(set).toHaveBeenCalledWith(BETA_COOKIE, CODE, BETA_COOKIE_OPTIONS);
  });

  it("refuses a used, unknown or expired code without setting anything", async () => {
    isOpen.mockResolvedValue(false);
    expect(await typed(CODE)).toEqual({
      attached: false,
      error: DRAFT_COPY.phone.inviteInvalid,
    });
    expect(set).not.toHaveBeenCalled();
  });

  it("does not ask the database about something that is not a code", async () => {
    expect((await typed("not a code")).attached).toBe(false);
    expect(isOpen).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  /** One path to the mark: the action carries a value, verifyCode spends it. */
  it("spends and stamps nothing itself", () => {
    const action = noComments(read("./invite-actions.ts"));
    expect(action).not.toMatch(/acceptBetaInvite|joined_in_beta|accepted_at/);
  });
});

describe("the signup screen offers it", () => {
  const page = noComments(read("./page.tsx"));

  it("renders the field under the phone form", () => {
    expect(page.indexOf("<InviteCodeField")).toBeGreaterThan(page.indexOf("<PhoneForm"));
  });

  /** "Attached" must mean THIS app or browser holds an open invitation. */
  it("says attached only for an open invitation in this cookie jar", () => {
    expect(page).toMatch(
      /attached=\{await betaInviteIsOpen\(\(await cookies\(\)\)\.get\(BETA_COOKIE\)\?\.value\)\}/,
    );
  });

  it("keeps it folded, since most people signing up have no code", () => {
    expect(noComments(read("./invite-code-field.tsx"))).toMatch(/<details/);
  });
});

describe("the code is shown wherever the link is", () => {
  const lib = noComments(read("../../../lib/waitlist.ts"));
  const beta = noComments(read("../../beta/[code]/page.tsx"));

  it("is in the invitation email, under the link", () => {
    expect(lib).toMatch(/\$\{link\}\\n\\n\$\{inviteCodeLine\(code\)\}/);
  });

  it("is in every reminder, under the link", () => {
    expect(lib).toMatch(
      /\/beta\/\$\{row\.invite_code\}\\n\\n\$\{inviteCodeLine\(row\.invite_code\)\}/,
    );
  });

  it("is on the invitation page, only for an invitation that is open", () => {
    expect(beta).toMatch(/\{open \? \(\s*<p[^>]*>\s*\{C\.codeIntro\}/);
    expect(beta).toMatch(/formatInviteCode\(code\)/);
  });
});
