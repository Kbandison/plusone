import "server-only";

import { createServiceSupabase } from "@plusone/db";
import { parseClientEnv, parseServerEnv } from "@plusone/config";

import { getServerSupabase } from "./supabase";

/**
 * Signed URLs for other members' photos (Decision #19, §5.3).
 *
 * The order here is the whole security model, so it is worth stating:
 *
 *   1. Read `visible_profile_photos` AS THE MEMBER. That view does its own
 *      authorisation — it is SECURITY DEFINER, because profile_photos is
 *      own-rows-only — and it decides WHICH variant, clear or blurred, from
 *      photo_privacy and whether a connect was accepted.
 *   2. Only then sign the path it returned, with the service client.
 *
 * The service client is used because members deliberately have no read policy
 * on each other's storage objects: a select policy there would be a second,
 * weaker path to the same bytes. So the only way to another member's photo is
 * through the view, and the view has already made the decision.
 *
 * Signing the path BEFORE the view has spoken would be the bug — it would work,
 * and it would hand out clear photos of people who chose blurred.
 */

const TTL_SECONDS = 60 * 10;

export interface MemberPhoto {
  readonly url: string;
  readonly isBlurred: boolean;
}

function serviceClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = parseClientEnv(process.env);
  const { SUPABASE_SECRET_KEY } = parseServerEnv(process.env);
  return createServiceSupabase(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY);
}

/**
 * One photo per member — the first, which is the one a card shows.
 *
 * Batched: a drop of three and a browse grid of sixty should be two round trips,
 * not sixty-three.
 */
export async function photosFor(userIds: readonly string[]): Promise<Map<string, MemberPhoto>> {
  const found = new Map<string, MemberPhoto>();
  if (userIds.length === 0) return found;

  const supabase = await getServerSupabase();
  const { data: rows } = await supabase
    .from("visible_profile_photos")
    .select("user_id, position, storage_path, is_blurred")
    .in("user_id", [...userIds])
    .eq("position", 0);

  if (!rows?.length) return found;

  const service = serviceClient();
  const { data: signed } = await service.storage.from("photos").createSignedUrls(
    rows.map((row) => row.storage_path as string),
    TTL_SECONDS,
  );

  const urlByPath = new Map(
    (signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl]),
  );

  for (const row of rows) {
    const url = urlByPath.get(row.storage_path as string);
    if (url) {
      found.set(row.user_id as string, {
        url,
        isBlurred: Boolean(row.is_blurred),
      });
    }
  }

  return found;
}

/**
 * The member's own photos. Read straight from `profile_photos`, which they own
 * — no view is needed to decide what someone may see of themselves.
 */
export async function ownPhotos(userId: string): Promise<readonly MemberPhoto[]> {
  const supabase = await getServerSupabase();
  const { data: rows } = await supabase
    .from("profile_photos")
    .select("storage_path, card_path, position")
    .eq("user_id", userId)
    .order("position", { ascending: true });

  if (!rows?.length) return [];

  const service = serviceClient();
  const { data: signed } = await service.storage
    .from("photos")
    // The card variant, like every other surface. The profile page renders
    // these at 72px and the original is 1600.
    .createSignedUrls(
      rows.map((r) => (r.card_path as string | null) ?? (r.storage_path as string)),
      TTL_SECONDS,
    );

  return (signed ?? []).flatMap((s) =>
    s.signedUrl ? [{ url: s.signedUrl, isBlurred: false }] : [],
  );
}
