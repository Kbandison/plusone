import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DRAFT_COPY, OTP } from "@plusone/config";

/**
 * The backup email screen — Kevin, 2026-09-23.
 *
 * Every member signs up by phone and, until this screen, Settings was the only
 * place to add an email — behind the onboarding gate. A member who stalled at
 * the face check had no channel at all: no email, no push, and texts promised
 * to be codes only. Two real testers were exactly that when this was written.
 */

type User = {
  id: string;
  phone_confirmed_at: string | null;
  email: string | null;
  new_email?: string;
};

let user: User | null;
let updateError: { code: string } | null;
let verifyError: { code: string } | null;
const updates: unknown[][] = [];
const verifies: unknown[] = [];

vi.mock("@/lib/supabase", () => ({
  getServerSupabase: async () => ({
    auth: {
      getUser: async () => ({ data: { user } }),
      updateUser: async (...args: unknown[]) => {
        updates.push(args);
        return { error: updateError };
      },
      verifyOtp: async (params: unknown) => {
        verifies.push(params);
        return { error: verifyError };
      },
    },
  }),
}));

class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));

const { sendBackupEmailCode, confirmBackupEmail } = await import("./actions");
const { STEP_ROUTES, BACKUP_EMAIL_ROUTE } = await import("@/lib/step-routes");

const E = DRAFT_COPY.app.emailErrors;
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const none = { error: null, sentTo: null };

beforeEach(() => {
  user = { id: "u1", phone_confirmed_at: "2026-09-23T10:00:00Z", email: null };
  updateError = null;
  verifyError = null;
  updates.length = 0;
  verifies.length = 0;
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.loveplusone.app");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveplusone.app");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

describe("sending the code", () => {
  it("puts the address on the account and says where it went", async () => {
    const state = await sendBackupEmailCode(none, form({ email: "  Person@Example.org " }));
    expect(state).toEqual({ error: null, sentTo: "person@example.org" });
    expect(updates).toHaveLength(1);
    expect(updates[0]![0]).toEqual({ email: "person@example.org" });
    // The link in the same email, for anybody who taps it anyway, lands on the
    // resolver through the callback.
    expect(updates[0]![1]).toEqual({
      emailRedirectTo: "https://www.loveplusone.app/auth/callback?next=/onboarding",
    });
  });

  it("refuses without a confirmed phone — the same rule as Settings", async () => {
    user!.phone_confirmed_at = null;
    const state = await sendBackupEmailCode(none, form({ email: "person@example.org" }));
    expect(state.error).toBe(E.phoneNotConfirmed);
    expect(updates).toHaveLength(0);
  });

  it("names the one error worth naming, and never says 'try again' to an address that cannot work", async () => {
    updateError = { code: "email_exists" };
    expect((await sendBackupEmailCode(none, form({ email: "a@example.org" }))).error).toBe(E.taken);
    updateError = { code: "email_address_invalid" };
    expect((await sendBackupEmailCode(none, form({ email: "a@example.org" }))).error).toBe(
      E.invalid,
    );
    updateError = { code: "over_email_send_rate_limit" };
    expect((await sendBackupEmailCode(none, form({ email: "a@example.org" }))).error).toBe(
      E.failed,
    );
  });

  it("asks for an address before doing anything", async () => {
    expect((await sendBackupEmailCode(none, form({ email: "   " }))).error).toBe(E.required);
    expect(updates).toHaveLength(0);
  });

  it("sends nobody signed out anywhere but the phone step", async () => {
    user = null;
    await expect(sendBackupEmailCode(none, form({ email: "a@example.org" }))).rejects.toMatchObject(
      {
        to: STEP_ROUTES.phone,
      },
    );
  });
});

describe("confirming it", () => {
  it("verifies against the address the SERVER holds, whatever the browser sent", async () => {
    // useActionState sends `prev` up from the browser. A tampered sentTo must
    // change nothing about what is verified.
    user!.new_email = "person@example.org";
    await expect(
      confirmBackupEmail(
        { error: null, sentTo: "attacker@example.org" },
        form({ code: "123 456" }),
      ),
    ).rejects.toMatchObject({ to: STEP_ROUTES.liveness });
    expect(verifies).toEqual([
      { email: "person@example.org", token: "123456", type: "email_change" },
    ]);
  });

  it("goes on to the face check, never back to the resolver", async () => {
    user!.new_email = "person@example.org";
    const done = confirmBackupEmail(
      { error: null, sentTo: "person@example.org" },
      form({ code: "12345678" }),
    );
    await expect(done).rejects.toMatchObject({ to: STEP_ROUTES.liveness });
    await expect(done).rejects.not.toMatchObject({ to: "/onboarding" });
  });

  it("keeps them on the screen with a wrong code", async () => {
    user!.new_email = "person@example.org";
    verifyError = { code: "otp_expired" };
    const state = await confirmBackupEmail(
      { error: null, sentTo: "person@example.org" },
      form({ code: "000000" }),
    );
    expect(state).toEqual({
      error: DRAFT_COPY.phone.errors.codeInvalid,
      sentTo: "person@example.org",
    });
  });

  it("carries on when the email's button already confirmed it", async () => {
    // The same email has a button; tapping it confirms the address on the
    // server, so nothing is pending when they come back and press Confirm.
    user!.email = "person@example.org";
    (user as User & { email_confirmed_at?: string }).email_confirmed_at = "2026-09-27T20:00:00Z";
    await expect(
      confirmBackupEmail({ error: null, sentTo: "person@example.org" }, form({ code: "123456" })),
    ).rejects.toMatchObject({ to: STEP_ROUTES.liveness });
    expect(verifies).toHaveLength(0);
  });

  it("does not verify anything when nothing is pending", async () => {
    const state = await confirmBackupEmail(
      { error: null, sentTo: "person@example.org" },
      form({ code: "123456" }),
    );
    expect(state.error).toBe(E.failed);
    expect(verifies).toHaveLength(0);
  });
});

describe("where it sits", () => {
  const SRC = join(import.meta.dirname, "..", "..", "..");
  const read = (p: string) =>
    readFileSync(join(SRC, p), "utf8")
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

  it("is where the phone step hands on to", () => {
    expect(BACKUP_EMAIL_ROUTE).toBe("/onboarding/email");
    const phone = read("app/onboarding/phone/actions.ts");
    expect(phone).toMatch(/redirect\(BACKUP_EMAIL_ROUTE\);/);
    expect(phone).not.toMatch(/redirect\(nextRoute\("phone"\)\)/);
  });

  it("is not a step, so the resolver can never send anybody back to it", () => {
    expect(Object.values(STEP_ROUTES)).not.toContain(BACKUP_EMAIL_ROUTE);
  });

  it("is shown only straight after the phone, to somebody with no address", () => {
    const page = read("app/onboarding/email/page.tsx");
    expect(page).toMatch(/if \(!data\.user\) redirect\(STEP_ROUTES\.phone\);/);
    expect(page).toMatch(
      /if \(step !== "liveness" \|\| data\.user\.email_confirmed_at\) redirect\(STEP_ROUTES\[step\]\);/,
    );
    expect(page).toMatch(/<BackupEmailForm skipTo=\{STEP_ROUTES\.liveness\} \/>/);
  });

  it("can always be skipped, from either state", () => {
    const f = read("app/onboarding/email/email-form.tsx");
    expect(f.match(/<Skip href=\{skipTo\} \/>/g) ?? []).toHaveLength(2);
  });

  it("takes a code as long as the dashboard sends, and offers the one it received", () => {
    const f = read("app/onboarding/email/email-form.tsx");
    expect(f).toMatch(/maxLength=\{OTP\.codeMaxLength\}/);
    expect(f).not.toMatch(/maxLength=\{6\}/);
    expect(f).toMatch(/autoComplete="one-time-code"/);
    expect(f).toMatch(/type="email"/);
    expect(OTP.codeMaxLength).toBeGreaterThanOrEqual(8);
  });

  it("sends an email that carries the code", () => {
    const template = readFileSync(
      join(SRC, "..", "..", "..", "supabase", "templates", "change-email.html"),
      "utf8",
    );
    expect(template).toMatch(/\{\{ \.Token \}\}/);
    // And keeps the link, which Settings still uses.
    expect(template).toMatch(/\{\{ \.ConfirmationURL \}\}/);
  });
});

describe("the copy Kevin chose", () => {
  it("is word for word", () => {
    const C = DRAFT_COPY.backupEmail;
    expect(C.heading).toBe("Add a backup email");
    expect(C.intro).toBe(
      "Optional. If you get stuck signing up, we can reach you here, and you can sign in with it instead of a text code.",
    );
    expect(C.emailLabel).toBe("Email address");
    expect(C.sendLabel).toBe("Send code");
    expect(C.skipLabel).toBe("Skip for now");
    expect(C.codePrompt("name@example.com")).toBe("Enter the code we sent to name@example.com.");
    expect(C.confirmLabel).toBe("Confirm");
  });
});

describe("the policy says what the screen promises", () => {
  // The screen says "we can reach you here"; the policy used to say an added
  // email was for sign-in and notifications, "never anything more". Kevin's
  // wording, 2026-09-27.
  it("names the use", async () => {
    const { PRIVACY_POLICY, PRIVACY_POLICY_EFFECTIVE } = await import("@plusone/config");
    const text = JSON.stringify(PRIVACY_POLICY);
    expect(text).toContain("if you get stuck signing up we may use it to help you finish");
    expect(PRIVACY_POLICY_EFFECTIVE >= "2026-09-27").toBe(true);
  });
});
