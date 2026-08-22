/**
 * Being spoken to.
 *
 * A room thread is two levels deep and no more — a post, comments on it, and
 * replies under each comment. Answering a REPLY has nowhere to go, so the
 * product does what a threaded conversation does once you stop drawing the
 * indent: it puts the person's name in the box and the reply sits beside the
 * others.
 *
 * That worked for reading and not at all for telling. The row nests under the
 * COMMENT, so the notification went to whoever wrote the comment — and the
 * person actually being answered, whose name is at the front of the message,
 * got nothing. Three people in a thread and only two of them were ever told.
 *
 * So the name becomes a tag. `@Cedar` is the same gesture the Reply button
 * already made, with a mark on it that can be found anywhere in a sentence
 * rather than only at the front, and that a member can type themselves.
 *
 * Nothing here resolves a name to a person. That happens in the database,
 * behind a function members cannot call — room_messages.user_id is revoked
 * from them, and it is revoked because an anonymous author must not be
 * traceable. A parser that returned ids would be a way to ask "is Cedar the
 * same person as Willow", and the answer to that question is not available at
 * any price.
 */

/**
 * How many words after an `@` are worth trying as a name.
 *
 * A room alias is always one word — the vocabulary is Cedar, Juniper, Slate —
 * but a display name is whatever somebody typed, and "Sam Okonkwo" is two.
 * Three is where it stops: past that the candidates are mostly sentence.
 */
const MAX_NAME_WORDS = 3;

/** Letters, marks, digits, and the punctuation people put in names. */
const NAME_CHARS = /[\p{L}\p{M}\p{N}'’.-]/u;

/**
 * Every name a body might be addressing, longest first.
 *
 * CANDIDATES, not names. "@Sam thanks for that" yields "Sam thanks for",
 * "Sam thanks" and "Sam", because nothing here knows which of those is a
 * person — the database does, and it is the thing that decides. Longest first
 * so a two-word display name wins over its own first word.
 *
 * Pure, and deliberately generous. A candidate that matches nobody costs one
 * row of a lookup; a name missed costs somebody a notification they were
 * addressed by.
 */
export function parseMentions(body: string): string[] {
  const found = new Set<string>();

  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== "@") continue;
    // Not mid-word. An email address is the case that matters — "write to
    // sam@example.com" is not a mention of example — and so is the "@" in a
    // time or a handle somebody has already typed.
    if (i > 0 && NAME_CHARS.test(body[i - 1]!)) continue;

    const rest = body.slice(i + 1);
    if (!rest || !NAME_CHARS.test(rest[0]!)) continue;

    // Walk word by word, recording each prefix as a candidate.
    let at = 0;
    const words: string[] = [];
    while (words.length < MAX_NAME_WORDS && at < rest.length) {
      let end = at;
      while (end < rest.length && NAME_CHARS.test(rest[end]!)) end += 1;
      if (end === at) break;

      // Trailing punctuation belongs to the sentence, not the name: "@Cedar,"
      // and "@Cedar." are both Cedar.
      const word = rest.slice(at, end).replace(/[.'’-]+$/u, "");
      if (!word) break;
      words.push(word);
      found.add(words.join(" "));

      if (rest[end] !== " ") break;
      at = end + 1;
    }
  }

  return [...found].sort((a, b) => b.length - a.length);
}

/** A run of text, or a name somebody is being called by. */
export interface MentionSpan {
  readonly text: string;
  readonly mention: boolean;
}

/**
 * A body split for rendering, with the names marked.
 *
 * Given the names the reader is allowed to see — the thread already knows
 * every one it contains — this finds them and hands back the pieces. Matching
 * rather than storing, for the same reason the notification row stores no
 * sentence: a mention resolved at read time is one that disappears when the
 * reader may no longer see who it names.
 *
 * Two forms, because there are two eras of them. `@Cedar` is what the box
 * produces now. A bare name at the very front is what it produced before, and
 * those messages are still in the database — so a leading name that matches
 * somebody in the thread still renders as one. Only the tagged form is ever
 * NOTIFIED: a bare name cannot be told apart from a sentence that happens to
 * begin with a word, and buzzing somebody for that is worse than missing it.
 */
export function mentionSpans(body: string, known: readonly string[]): MentionSpan[] {
  // Longest first, so "Sam Okonkwo" is not matched as "Sam" with a surname
  // left over.
  const names = [...known].filter(Boolean).sort((a, b) => b.length - a.length);
  const spans: MentionSpan[] = [];
  const push = (text: string, mention: boolean) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && last.mention === mention)
      spans[spans.length - 1] = { text: last.text + text, mention };
    else spans.push({ text, mention });
  };

  let i = 0;

  // The legacy form, and only at position nought.
  const leading = names.find((name) => body.startsWith(`${name} `));
  if (leading) {
    push(leading, true);
    i = leading.length;
  }

  while (i < body.length) {
    if (body[i] !== "@" || (i > 0 && NAME_CHARS.test(body[i - 1]!))) {
      push(body[i]!, false);
      i += 1;
      continue;
    }

    const after = body.slice(i + 1);
    const name = names.find((n) => after.toLowerCase().startsWith(n.toLowerCase()));
    if (!name) {
      push(body[i]!, false);
      i += 1;
      continue;
    }

    // The "@" goes with the name. It is part of the mark, and a stray one left
    // in the sentence reads as a typo.
    push(`@${after.slice(0, name.length)}`, true);
    i += 1 + name.length;
  }

  return spans;
}

/**
 * The text the composer puts in the box when Reply is pressed.
 *
 * One place, because the composer writes it and the cancel button has to take
 * exactly the same thing back out again — and those two drifted apart the
 * moment the "@" was added by hand in one of them.
 */
export const mentionPrefix = (name: string): string => `@${name} `;
