import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { ImageLightbox } from "./image-lightbox";

const C = DRAFT_COPY.app;

/**
 * A picture on a post, through a signed URL minted per render.
 *
 * The bucket is private and its storage policy checks room membership, so the
 * URL is short-lived and only obtainable by somebody already entitled to see
 * it. A public path would be a permanent public link to a picture posted in a
 * room named for a diagnosis.
 *
 * The URL is minted here and handed to the client component that renders it —
 * so the storage path itself never reaches the browser, only a link that
 * expires.
 *
 * Never next/image: Vercel's optimiser caches by URL, and these are per-viewer
 * signed objects, so the first member to look would populate a cache entry
 * anybody could then read straight from the CDN.
 */
export async function PostImage({ path, footer }: { path: string; footer: React.ReactNode }) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.storage.from("room-images").createSignedUrl(path, 60 * 10);

  if (!data?.signedUrl) return null;

  return (
    // Decorative to a reader by default: only the person who posted it knows
    // what is in it, and inventing a description would be a guess presented as
    // a fact.
    <ImageLightbox src={data.signedUrl} alt={C.postImageAlt} footer={footer} />
  );
}
