import { CONNECTS } from "@plusone/config";

/**
 * Tone check (§6.6). Rule-based v1; a Claude Haiku pass is a v2 ledger item.
 *
 * This guards the free-text lines members attach to closure notes and connect
 * requests — the two places where someone can put words in front of a stranger
 * who did not ask for them.
 *
 * One rule here matters more than the rest: A CLOSURE LINE MAY NOT MENTION A
 * CONDITION. §3.5's closure notes are read by someone being turned down, and a
 * parting shot about their status is the single cruellest thing this product
 * could carry. It is also the one thing a blocklist can reliably catch.
 *
 * The bar is deliberately conservative. A false positive costs someone one
 * rewrite; a false negative is a message that cannot be unread.
 */

export type ToneViolation =
  | "too_long"
  | "contact_info"
  | "condition_reference"
  | "sexual_content"
  | "insult";

export interface ToneResult {
  readonly ok: boolean;
  readonly violations: readonly ToneViolation[];
}

/**
 * Condition words, in the forms people actually type. Matched with word
 * boundaries so "positively" is not "positive" and "shiv" is not "hsv".
 */
const CONDITION_PATTERNS: readonly RegExp[] = [
  /\bhsv\s?-?\s?[12]?\b/i,
  /\bhiv\b/i,
  /\bherpes\b/i,
  /\bu\s?=\s?u\b/i,
  /\bundetectable\b/i,
  /\b(?:std|sti)s?\b/i,
  /\boutbreaks?\b/i,
  /\bcold\s?sores?\b/i,
  /\bpoz\b/i,
  /\bclean\b/i, // as in "are you clean" — the word the whole product exists against
  /\bdiagnos(?:is|ed|es)\b/i,
  /\bpositive\b/i,
  /\bnegative\b/i,
  /\bdirty\b/i,
];

/** Phone numbers, emails, handles, links — anything that moves a stranger off-platform. */
const CONTACT_PATTERNS: readonly RegExp[] = [
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
  // Up to two separator characters between digits: "+1 (555) 123-4567" has a
  // ") " between two of them, which a single-character class misses.
  /\+?\d(?:[\s().\-]{0,2}\d){8,}/,
  /\b(?:https?:\/\/|www\.)\S+/i,
  /\b(?:instagram|snapchat|telegram|whatsapp|signal|kik|discord)\b/i,
  /(?:^|\s)@[a-z0-9._]{3,}/i,
];

const SEXUAL_PATTERNS: readonly RegExp[] = [
  /\bn[uü]des?\b/i,
  /\bh[o0]rny\b/i,
  /\bd[ie]ck\s?pics?\b/i,
  /\bsext(?:ing)?\b/i,
  /\bhook\s?up\s?(?:only|now)\b/i,
  /\bnsa\b/i,
  /\bdtf\b/i,
];

const INSULT_PATTERNS: readonly RegExp[] = [
  /\b(?:ugly|gross|disgusting|revolting|repulsive)\b/i,
  /\b(?:loser|pathetic|worthless|freak)\b/i,
  /\bwaste\s+of\s+(?:time|space)\b/i,
  /\bshut\s?up\b/i,
];

const matchesAny = (text: string, patterns: readonly RegExp[]) =>
  patterns.some((pattern) => pattern.test(text));

export interface ToneOptions {
  /** Closure lines carry the condition rule; a connect line carries it too. */
  readonly maxChars?: number;
  /**
   * Whether the member may name their own condition here.
   *
   * The condition rule exists because §8 forbids condition words in anything
   * that leaves the app — a closure note and a decline note are both delivered
   * as notifications, so a member naming their diagnosis in one would put it on
   * someone else's lock screen.
   *
   * A room post never leaves. It is read inside a room the member chose to
   * enter, by people the community wall already admitted. Applying the
   * notification rule there made the rooms refuse their own subject: the room
   * titled "Newly diagnosed" rejected the word "diagnosed", and the U=U room
   * rejected "U=U". The rule that protects a closure note was breaking the one
   * place on this app whose entire purpose is talking about this.
   *
   * Everything else in the check — contact details, sexual content, insults —
   * still applies. This opts out of one rule, not out of moderation.
   */
  readonly allowConditionWords?: boolean;
}

/**
 * Checks a member-written line.
 *
 * Returns every violation rather than the first, so someone rewriting is not
 * sent round the loop three times to be told three things.
 */
export function checkTone(text: string, options: ToneOptions = {}): ToneResult {
  const maxChars = options.maxChars ?? CONNECTS.personalLineMaxChars;
  const trimmed = text.trim();
  const violations: ToneViolation[] = [];

  if (trimmed.length > maxChars) violations.push("too_long");
  if (matchesAny(trimmed, CONTACT_PATTERNS)) violations.push("contact_info");
  if (!options.allowConditionWords && matchesAny(trimmed, CONDITION_PATTERNS)) {
    violations.push("condition_reference");
  }
  if (matchesAny(trimmed, SEXUAL_PATTERNS)) violations.push("sexual_content");
  if (matchesAny(trimmed, INSULT_PATTERNS)) violations.push("insult");

  return { ok: violations.length === 0, violations };
}

/** Whether a line may be attached to a closure note (§3.5). */
export function isAcceptableClosureLine(text: string): boolean {
  return checkTone(text).ok;
}
