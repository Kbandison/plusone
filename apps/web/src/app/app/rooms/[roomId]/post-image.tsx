import Image from "next/image";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";

const C = DRAFT_COPY.app;

/**
 * A picture on a post, through a signed URL minted per render.
 *
 * The bucket is private and its storage policy checks room membership, so the
 * URL is short-lived and only obtainable by somebody already entitled to see
 * it. A public path would be a permanent public link to a picture posted in a
 * room named for a diagnosis.
 *
 * Never optimised, for the same reason profile photos are not: the bytes behind
 * one of these URLs are reachable only by a member of that room, and Vercel's
 * optimiser caches by URL — so the first viewer would populate a cache entry
 * that anybody could then read straight from the CDN.
 */
export async function PostImage({ path }: { path: string }) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.storage.from("room-images").createSignedUrl(path, 60 * 10);

  if (!data?.signedUrl) return null;

  return (
    <Image
      src={data.signedUrl}
      // Decorative to a reader by default: only the person who posted it knows
      // what is in it, and inventing a description would be a guess presented
      // as a fact.
      alt={C.postImageAlt}
      width={1600}
      height={1600}
      sizes="(max-width: 640px) 100vw, 520px"
      unoptimized
      // h-auto with a fixed intrinsic size: the real aspect ratio is whatever
      // was uploaded, and letting the height follow the width is what stops a
      // portrait photograph being letterboxed into a square.
      className="mt-2 h-auto w-full rounded-xl border border-line-2 object-cover"
    />
  );
}
