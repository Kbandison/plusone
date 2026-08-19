import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";

const C = DRAFT_COPY.app;

/**
 * Plays a voice note through a signed URL, minted per render.
 *
 * The bucket is private and the storage policy checks chat participation, so
 * the URL is short-lived and only obtainable by someone already entitled to
 * hear it. A public path would be a permanent link to somebody's actual voice.
 */
export async function VoiceNote({ path, seconds }: { path: string; seconds: number | null }) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.storage.from("voice-notes").createSignedUrl(path, 60 * 10);

  if (!data?.signedUrl) return <span className="text-[11.7px] text-ink-3">Voice note</span>;

  return (
    <span className="flex items-center gap-3">
      {/* A bare <audio controls> is announced as "audio player" with no
          indication of whose voice it is or how long it runs. */}
      <audio
        src={data.signedUrl}
        controls
        preload="none"
        aria-label={C.voiceNoteAria(seconds)}
        className="max-w-full"
      />
      {seconds ? <span className="text-[11px] text-ink-3">{seconds}s</span> : null}
    </span>
  );
}
