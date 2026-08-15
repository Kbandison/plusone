export { createBrowserSupabase, createServerSupabase, createServiceSupabase } from "./clients";
export type { CookieAdapter, SupabaseCredentials } from "./clients";

/**
 * Names of the SECURITY DEFINER RPCs. Every mechanic transition goes through one
 * of these — never a direct table write (§5.3.4).
 */
export const RPC = {
  createConnect: "create_connect",
  acceptConnect: "accept_connect",
  declineConnect: "decline_connect",
  proposeDatePlan: "propose_date_plan",
  confirmDatePlan: "confirm_date_plan",
  cancelDatePlan: "cancel_date_plan",
  closeChat: "close_chat",
  switchMode: "switch_mode",
  changeIntention: "change_intention",
  requestDeletion: "request_deletion",
  inviteCodeExists: "invite_code_exists",
} as const;

/**
 * The only relations a client may read another member through. Querying
 * `profiles` directly for someone else is a bug — it bypasses the ergonomic path
 * and, for photos, would hand out a clear storage path the viewer isn't owed.
 */
export const VIEWS = {
  visibleProfiles: "visible_profiles",
  previewProfiles: "preview_profiles",
  visibleProfilePhotos: "visible_profile_photos",
} as const;
