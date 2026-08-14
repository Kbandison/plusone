import type { tone } from "@plusone/logic";

/**
 * Tone violations as sentences.
 *
 * Not in the actions file: every export from a "use server" module has to be an
 * async server function, so a plain helper there fails the build.
 *
 * Shown to someone mid-sentence, so they read as a person talking rather than a
 * validator firing. The condition one is deliberately the gentlest — someone
 * who has just been told their note is unacceptable does not also need to be
 * told off.
 */
const REASONS: Record<tone.ToneViolation, string> = {
  too_long: "That's longer than we allow here.",
  contact_info: "Leave contact details out of this one.",
  condition_reference: "Please leave anyone's status out of this.",
  sexual_content: "That's not something to send here.",
  insult: "That reads harsher than it needs to.",
};

export function describeViolations(violations: readonly tone.ToneViolation[]): string {
  return violations.map((v) => REASONS[v]).join(" ");
}
