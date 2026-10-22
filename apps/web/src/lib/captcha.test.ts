import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CAPTCHA_FIELD, captchaTokenOption } from "./captcha";

/**
 * The SMS pumping defences, pinned. From 2026-10-20 a bot sent 134 codes to
 * Belarus through the signup form until Twilio's balance ran out, and both
 * halves of the fix fail SILENTLY if they drift:
 *
 *   · a send that forgets its token works perfectly — until Supabase's CAPTCHA
 *     is switched on, and then that screen refuses everybody;
 *   · a send that skips the country check works perfectly, and pays.
 */

const SRC = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Comments out, anchored to line start so a "/*" inside a string survives. */
const code = (p: string) =>
  read(p)
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/^[ \t]*\{\/\*[\s\S]*?\*\/\}/gm, "");

/** Imports out too, so an ordering check measures calls rather than imports. */
const body = (p: string) => code(p).replace(/^import[\s\S]*?;\s*$/gm, "");

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sources(rel, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(rel);
  }
  return acc;
}

const SENDERS = ["app/onboarding/phone/actions.ts", "app/sign-in/actions.ts"];
const FORMS = ["app/onboarding/phone/phone-form.tsx", "app/sign-in/sign-in-form.tsx"];

describe("every code send carries a CAPTCHA token", () => {
  it("no signInWithOtp call goes without the token option", () => {
    const offenders: string[] = [];
    let calls = 0;
    for (const f of sources("app")) {
      // Each call's OWN argument object, to its closing `})`. Not a fixed
      // window: /sign-in's two calls sit within 300 characters of each other,
      // so a window from the first reads the second's token and passes a call
      // that has none. Sabotaged that way on 2026-10-22, and it passed.
      for (const match of code(f).matchAll(/signInWithOtp\(\{([\s\S]*?)\}\)/g)) {
        calls += 1;
        // The spread itself, or the local /sign-in holds it in for both branches.
        if (!/\.\.\.(captchaTokenOption\(formData\)|captcha\b)/.test(match[1] as string)) {
          offenders.push(f);
        }
      }
    }
    // The floor: signup, and both branches of sign-in. A rename that emptied
    // this scan would otherwise report success for a check it never made.
    expect(calls, "found no signInWithOtp calls — this scan has gone blind").toBeGreaterThanOrEqual(
      3,
    );
    expect(offenders, "a send that Supabase will refuse once CAPTCHA is on").toEqual([]);
  });

  it("each form renders a widget for the first send AND for the resend", () => {
    // A resend is another paid SMS. One widget per form would leave the
    // resend button sending without a token.
    for (const f of FORMS) {
      expect(code(f).match(/<Turnstile\b/g)?.length, f).toBe(2);
    }
  });

  it("the widget writes the field the actions read", () => {
    const widget = code("app/turnstile.tsx");
    expect(widget).toMatch(/"response-field-name":\s*CAPTCHA_FIELD/);

    const form = new FormData();
    form.set(CAPTCHA_FIELD, "token-123");
    expect(captchaTokenOption(form)).toEqual({ captchaToken: "token-123" });
  });

  it("an empty token is no key at all, not captchaToken: undefined", () => {
    const form = new FormData();
    form.set(CAPTCHA_FIELD, "");
    expect(captchaTokenOption(form)).toEqual({});
    expect("captchaToken" in captchaTokenOption(new FormData())).toBe(false);
  });

  it("/sign-in's local really is the option, not a stray name", () => {
    expect(code("app/sign-in/actions.ts")).toMatch(
      /const captcha = captchaTokenOption\(formData\);/,
    );
  });
});

describe("the country check runs before anything is paid for", () => {
  it.each(SENDERS)("%s checks the destination before signInWithOtp", (f) => {
    const source = body(f);
    const check = source.indexOf("isSmsDestinationAllowed(");
    const send = source.indexOf("signInWithOtp(");
    // Both found first — an indexOf of -1 would make the ordering below pass
    // on a file that does neither.
    expect(check, `${f} no longer checks the destination`).toBeGreaterThan(-1);
    expect(send, `${f} no longer sends`).toBeGreaterThan(-1);
    expect(check).toBeLessThan(send);
  });
});

describe("no send failure falls through to 'sent'", () => {
  /**
   * Both send actions end `return { error: null, sentTo }` AFTER the switch,
   * and the switch has no default. So a SendFailureAction with no case does not
   * fail to compile — it reports SUCCESS, and a member waits on a code screen
   * for a text nothing sent. `captcha_failed` was added for this change, which
   * is exactly the moment that happens.
   */
  const union = readFileSync(
    join(SRC, "../../../packages/logic/src/verification/sign-in.ts"),
    "utf8",
  );
  const declaration = /export type SendFailureAction =([\s\S]*?);/.exec(union)?.[1] ?? "";
  const variants = [...declaration.matchAll(/\|\s*"([a-z_]+)"/g)].map((m) => m[1] as string);

  it("reads the union at all", () => {
    expect(variants).toContain("captcha_failed");
    expect(variants.length).toBeGreaterThanOrEqual(6);
  });

  it.each(SENDERS)("%s has a case for every variant", (f) => {
    const source = code(f);
    for (const variant of variants) {
      expect(source, `${f} has no case for "${variant}"`).toContain(`case "${variant}":`);
    }
  });
});
