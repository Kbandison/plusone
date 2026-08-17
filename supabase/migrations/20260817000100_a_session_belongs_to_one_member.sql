-- One live face could verify unlimited accounts.
--
-- beginLiveness created a Rekognition session and handed the raw SessionId to
-- the browser, storing it nowhere. finishLiveness then read `session_id` off
-- the submitted form and asked AWS for that session's verdict, with no check
-- that the member submitting it was the member who opened it.
--
-- GetFaceLivenessSessionResults takes exactly one field — SessionId — and
-- returns the same verdict to whoever asks. So one operator could pass a single
-- genuine check on account A, read the session id out of the page, and paste it
-- into the finish form of accounts B, C and D, minting verified badges without
-- ever opening a camera again. That decouples "a live human was present" from
-- "this account", which is the entire thing Decision #21 exists to couple.
--
-- The id now lives on the row that owns it. finishLiveness reads it from here
-- and ignores the form completely, so there is no field left to forge, and it
-- is cleared on use so a verdict cannot be replayed.
--
-- Not in the members' column grant (20260815000800): `authenticated` has no
-- table-level UPDATE on profiles, so a column it is not explicitly granted is
-- one it cannot write. A member who could set their own session id would be
-- back where we started.
alter table public.profiles
  add column if not exists liveness_session_id text;

comment on column public.profiles.liveness_session_id is
  'The Face Liveness session this member currently has open (Decision #21). '
  'Written and cleared only by the service client. Never in the members'' update '
  'grant — a session id the member can set is a verdict the member can borrow.';
