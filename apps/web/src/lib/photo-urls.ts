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
  return photosFrom("visible_profile_photos", "storage_path", userIds);
}

/**
 * The Preview Drop's photos, which are blurred by construction.
 *
 * Decision #19 and §6.1 step 5 both specify blurred photos for a support-only
 * member's preview, and the page called photosFor() for both variants.
 * visible_profile_photos keys its CASE on photo_privacy and
 * i_have_connected_with() and knows nothing about the viewer's MODE —
 * photo_privacy defaults to 'clear', and can_view_profile's mode wall passes any
 * target for a support-only viewer. So preview_profiles correctly returned only
 * an age band, an intention and a distance bucket, and the card rendered them
 * above a fully identifiable photograph of somebody who had been told otherwise.
 *
 * preview_profile_photos (20260817000800) has no column that could return a
 * clear path, so this cannot regress by someone passing the wrong flag.
 */
export async function previewPhotosFor(
  userIds: readonly string[],
): Promise<Map<string, MemberPhoto>> {
  return photosFrom("preview_profile_photos", "path", userIds);
}

async function photosFrom(
  view: "visible_profile_photos" | "preview_profile_photos",
  pathColumn: "storage_path" | "path",
  userIds: readonly string[],
): Promise<Map<string, MemberPhoto>> {
  const found = new Map<string, MemberPhoto>();
  if (userIds.length === 0) return found;

  const supabase = await getServerSupabase();
  const { data: rows } = await supabase
    .from(view)
    .select(`user_id, position, ${pathColumn}, is_blurred`)
    .in("user_id", [...userIds])
    .eq("position", 0);

  if (!rows?.length) return found;

  const service = serviceClient();
  const { data: signed } = await service.storage.from("photos").createSignedUrls(
    rows.map((row) => (row as Record<string, unknown>)[pathColumn] as string),
    TTL_SECONDS,
  );

  const urlByPath = new Map(
    (signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl]),
  );

  for (const row of rows) {
    const url = urlByPath.get((row as Record<string, unknown>)[pathColumn] as string);
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

/** One of the member's own photos, addressable — which `MemberPhoto` is not. */
export interface OwnPhoto {
  readonly id: string;
  readonly url: string;
  readonly position: number;
  /**
   * This photo's own privacy, or null to follow `profiles.photo_privacy`
   * (server 18b). Null is what every row had before per-photo existed and what
   * a free member always has — see 20260829002000.
   */
  readonly photoPrivacy: "clear" | "blurred_until_connected" | null;
}

/**
 * The member's own photos WITH their ids.
 *
 * `ownPhotos` returns urls alone, which is all a profile page renders — but
 * nothing could remove one, because nothing could name one. The photo step
 * showed a count and no way to change what it was counting, so a wrong photo
 * meant starting the account again.
 */
export async function ownPhotoList(userId: string): Promise<readonly OwnPhoto[]> {
  const supabase = await getServerSupabase();

  /**
   * Asked for WITH photo_privacy, and again without it if the column is not
   * there yet (server 18b).
   *
   * Migrations here are applied by hand and are Kevin's call, so code reaches
   * production before its schema as a matter of course. PostgREST does not fail
   * narrowly on an unknown column — it fails the WHOLE request — so without
   * this the gallery would return NO photos at all on both the profile and the
   * onboarding step, for every member, until 20260829002000 was applied. WSL
   * blanked the entire profile page this way earlier today.
   *
   * The retry is narrow on purpose: PGRST204 is "column not found in schema
   * cache" and 42703 is Postgres's `undefined_column`. Anything else is a
   * genuine failure and still returns nothing, because a catch-all here would
   * swallow a real error and quietly show a member an empty gallery.
   */
  const columns = "id, storage_path, card_path, position";
  type PhotoRow = Record<string, unknown>;

  const withPrivacy = await supabase
    .from("profile_photos")
    .select(`${columns}, photo_privacy`)
    .eq("user_id", userId)
    .order("position", { ascending: true });

  let rows = withPrivacy.data as PhotoRow[] | null;
  const code = withPrivacy.error?.code;
  if (code === "PGRST204" || code === "42703") {
    const fallback = await supabase
      .from("profile_photos")
      .select(columns)
      .eq("user_id", userId)
      .order("position", { ascending: true });
    rows = fallback.data as PhotoRow[] | null;
  }

  if (!rows?.length) return [];

  const service = serviceClient();
  const { data: signed } = await service.storage.from("photos").createSignedUrls(
    rows.map((r) => (r.card_path as string | null) ?? (r.storage_path as string)),
    TTL_SECONDS,
  );

  // Zipped by index rather than matched by path: createSignedUrls answers in
  // the order it was asked, and a failed signature must drop that ONE photo
  // rather than shift every id onto the wrong picture.
  return rows.flatMap((row, index) => {
    const url = signed?.[index]?.signedUrl;
    return url
      ? [
          {
            id: row.id as string,
            url,
            position: row.position as number,
            photoPrivacy: (row.photo_privacy as OwnPhoto["photoPrivacy"]) ?? null,
          },
        ]
      : [];
  });
}
