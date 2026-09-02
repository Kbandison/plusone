"use client";

import { useState } from "react";

/**
 * The composer, and the controls that appear once it is being used.
 *
 * ── why this is state and not `group-focus-within` ──────────────────────────
 *
 * It WAS CSS, which is normally the right answer for a reveal: no race between
 * blur and click, nothing to get out of step. It fails here because both
 * controls in the row genuinely lose focus as part of working.
 *
 *   - The photo button opens the native file picker, which takes focus off the
 *     page entirely. When the dialog closes, focus lands on <body>.
 *   - The recorder swaps its button per phase, so pressing Record UNMOUNTS the
 *     element that had focus — see the note in voice-recorder.tsx about each
 *     phase rendering a different button.
 *
 * Under focus-within both of those collapse the row at the moment the member
 * is using it, which is the bug Kevin hit: the row vanished because he had not
 * tapped the text box, having tapped one of its own controls instead.
 *
 * ── it latches, and never closes ────────────────────────────────────────────
 *
 * There is no close condition on purpose. Anything that closes has to decide
 * whether a given blur is "leaving" or "reaching for the microphone", and that
 * is the judgement that was wrong above. Opening a chat gets a clean composer,
 * which is what the hiding is for; after the first interaction the row has been
 * asked for and stays.
 *
 * ── and it keeps the three controls adjacent in page.tsx ────────────────────
 *
 * They arrive as `children` rather than being moved in here, because
 * chat-layout.test.ts pins them as siblings in that file — the guard against
 * them being stacked back into a column. Passing the composer as a prop rather
 * than wrapping it keeps the same property for it.
 */
export function ComposerTray({
  composer,
  children,
}: {
  composer: React.ReactNode;
  children: React.ReactNode;
}) {
  const [used, setUsed] = useState(false);

  return (
    // Capture, so focus reaching the text box or anything inside the row counts
    // — focus events do not bubble, so the non-capturing handler would only see
    // the wrapper itself.
    <div onFocusCapture={() => setUsed(true)}>
      {composer}
      {used ? <div className="mt-2 flex flex-wrap items-center gap-3">{children}</div> : null}
    </div>
  );
}
