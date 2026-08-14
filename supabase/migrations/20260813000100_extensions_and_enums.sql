-- Plus One — extensions and domain enums (spec §5.1)
--
-- This project runs on a NEW, dedicated Supabase project (Decision #4). No schema
-- object here may be shared with, or reference, any other product's infrastructure.

create extension if not exists pgcrypto with schema extensions;
-- Coarse geography for radius-bound discovery. Coordinates are stored rounded
-- (§5.3.6) and never returned to a client — only bucketed distances are.
create extension if not exists postgis with schema extensions;

-- ── Condition data (Decision #6) ──────────────────────────────────────────────
-- Self-declared, single enum plus an optional U=U boolean. No diagnosis dates,
-- no lab values, no documents, no free text. Never verified, never requested.
create type public.condition_community as enum ('hsv', 'hiv');

create type public.condition_detail as enum ('hsv1', 'hsv2', 'hsv1_hsv2', 'hiv', 'hiv_hsv');

-- ── Membership ────────────────────────────────────────────────────────────────
create type public.intention as enum ('long_term', 'open_to_either', 'casual', 'friends_support');

-- 'support_only' is a shield, not a preference: it removes the member from every
-- dating surface with zero exceptions, including paid ones (Decision #17).
create type public.member_mode as enum ('dating', 'support_only');

create type public.photo_privacy as enum ('clear', 'blurred_until_connected');

create type public.verification_status as enum (
  'unverified',
  'phone_verified',
  'liveness_pending',
  'verified',
  'flagged',
  'rejected'
);

-- ── Connects and chats ────────────────────────────────────────────────────────
create type public.connect_status as enum ('pending', 'accepted', 'declined', 'expired');

create type public.connect_source as enum ('drop', 'browse', 'room');

-- No interaction ends in silence (Decision #14): every terminal state carries a note.
create type public.chat_status as enum (
  'open',
  'date_planned',
  'closed_fuse',
  'closed_by_member',
  'graduated'
);

-- ── Community rooms ───────────────────────────────────────────────────────────
create type public.room_scope as enum ('all', 'hsv', 'hiv');

-- ── Growth ────────────────────────────────────────────────────────────────────
create type public.referral_tier as enum ('tier1_3', 'tier2_5', 'tier3_10');

create type public.reward_status as enum (
  'auto_granted',
  'pending_approval',
  'approved',
  'denied',
  'clawed_back'
);

-- ── Safety and compliance ─────────────────────────────────────────────────────
create type public.report_reason as enum (
  'fake_profile',
  'harassment',
  'sexual_content',
  'spam_or_scam',
  'underage',
  'other'
);

create type public.moderation_status as enum ('open', 'in_review', 'resolved', 'dismissed');

create type public.moderation_kind as enum (
  'user_report',
  'message_report',
  'room_message_report',
  'verification_flag',
  'referral_fraud_signal'
);

create type public.deletion_status as enum ('requested', 'purging', 'purged', 'cancelled');

create type public.consent_kind as enum ('health_data', 'terms', 'privacy_policy');
