import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { ImageLightbox } from "@/app/app/rooms/[roomId]/image-lightbox";

const C = DRAFT_COPY.app;

/**
 * A photograph in a chat, behind a signed URL minted per render.
 *
 * The same reasoning VoiceNote gives: the bucket is private and the storage
 * policy checks chat participation, so the URL is short-lived and only
 * obtainable by somebody already entitled to see it. A public path would be a
 * permanent link to a picture sent to one person.
 *
 * Ten minutes, matching the voice note beside it. Long enough to read a thread,
 * short enough that a URL copied out of the page stops working before it is
 * worth anything.
 */
export async function ChatImage({ path, footer }: { path: string; footer: React.ReactNode }) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.storage.from("chat-images").createSignedUrl(path, 60 * 10);

  if (!data?.signedUrl) return <span className="text-[11.7px] text-ink-3">{C.chatImageAlt}</span>;

  return (
    <ImageLightbox
      src={data.signedUrl}
      alt={C.chatImageAlt}
      label={C.chatImageOpen}
      footer={footer}
      // A bubble, not a row: no z-20 (nothing is covering it), and sized to the
      // picture rather than stretched to the width of the thread.
      triggerClassName="ease-brand block cursor-zoom-in transition-opacity duration-300 hover:opacity-95"
      imageClassName="max-h-[280px] w-auto max-w-full rounded-lg object-contain"
    />
  );
}
