"use server";

import { DRAFT_COPY, isMetro } from "@plusone/config";

import { joinWaitlist } from "@/lib/waitlist";
import type { WaitlistState } from "./state";

const E = DRAFT_COPY.waitlist.errors;

/**
 * A shape check, not a deliverability check.
 *
 * Deliberately permissive: the only thing that proves an address is real is the
 * confirmation email, and a stricter regex here would refuse valid addresses
 * (plus-addressing, new TLDs, unicode local parts) while catching nothing the
 * send would not catch anyway. It matches the CHECK constraint on the column so
 * a row that passes here cannot be refused by the database.
 */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function join(_previous: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: E.emailRequired, sent: false };
  if (!EMAIL.test(email)) return { error: E.emailInvalid, sent: false };

  const metro = String(formData.get("metro") ?? "").trim();
  if (!metro) return { error: E.metroRequired, sent: false };
  if (!isMetro(metro)) return { error: E.metroInvalid, sent: false };

  const wantsBeta = formData.get("beta") === "on";

  try {
    await joinWaitlist({ email, metro, wantsBeta });
  } catch (cause) {
    // The address must not reach a log — see the §9.6 note in lib/email.ts.
    console.error(
      JSON.stringify({
        at: "waitlist.action",
        problem: cause instanceof Error ? cause.message : "unknown",
      }),
    );
    return { error: E.failed, sent: false };
  }

  // Always the same answer. See the oracle rule.
  return { error: null, sent: true };
}
