import {
  CLOSURE_TEMPLATES,
  CONNECTS,
  DEFAULT_CLOSURE_TEMPLATE_INDEX,
  FUSE,
} from "@plusone/config";

import type {
  ClosureState,
  DatePlan,
  FuseConfig,
  FuseErrorCode,
  FuseEvent,
  FuseResult,
  FuseState,
} from "./types";
import { TERMINAL_STATUSES } from "./types";

const HOUR_MS = 60 * 60 * 1000;

export const DEFAULT_FUSE_CONFIG: FuseConfig = {
  windowHours: FUSE.windowHours,
  reArmHoursAfterCancelledPlan: FUSE.reArmHoursAfterCancelledPlan,
  warningHoursBeforeExpiry: FUSE.warningHoursBeforeExpiry,
  personalLineMaxChars: CONNECTS.personalLineMaxChars,
  templateCount: CLOSURE_TEMPLATES.length,
};

function isTerminal(status: FuseState["status"]): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

function fail(code: FuseErrorCode): FuseResult {
  return { ok: false, code };
}

function ok(state: FuseState): FuseResult {
  return { ok: true, state };
}

/** A plan is only a plan when all three parts are filled in (§6.2). */
export function isPlanComplete(plan: DatePlan | null | undefined): boolean {
  if (!plan) return false;
  return (
    plan.date.trim().length > 0 && plan.time.trim().length > 0 && plan.place.trim().length > 0
  );
}

/** The state a chat is born in, the moment a connect is accepted. */
export function openChat(at: number, config: FuseConfig = DEFAULT_FUSE_CONFIG): FuseState {
  return {
    status: "open",
    fuseExpiresAt: at + config.windowHours * HOUR_MS,
    plan: null,
    closure: null,
  };
}

function closureFor(
  template: number,
  personalLine: string | null,
  closedBy: string | null,
  at: number,
): ClosureState {
  return { template, personalLine, closedBy, closedAt: at };
}

/**
 * The whole state machine, as one pure reducer. No clocks, no I/O, no randomness —
 * `at` is always supplied by the caller so every transition is reproducible.
 */
export function transition(
  state: FuseState,
  event: FuseEvent,
  config: FuseConfig = DEFAULT_FUSE_CONFIG,
): FuseResult {
  // Every event carries a caller-supplied `at`, and NaN compares false against
  // everything — so `sweep` with a non-finite time read as "not yet expired",
  // fell through, and closed a live chat, while needsSweep() said no sweep was
  // due. Two functions disagreeing about the same chat, and the one that acts
  // is the one that destroys it. Refuse the input instead.
  if (!Number.isFinite(event.at)) return fail("invalid_time");

  // A closed chat is closed. Nothing reopens it — not a sweep, not a new plan,
  // and there is deliberately no event that starts one over.
  if (isTerminal(state.status)) return fail("already_closed");

  switch (event.type) {
    case "propose_plan": {
      if (state.status !== "open") return fail("not_open");
      if (!isPlanComplete(event.plan)) return fail("plan_incomplete");
      // The fuse KEEPS RUNNING while a plan sits unconfirmed. A proposal one side
      // never answers must not buy time — that would be an extension by another name.
      return ok({
        ...state,
        plan: { plan: event.plan, proposedBy: event.by, confirmedBy: null },
      });
    }

    case "confirm_plan": {
      if (state.status !== "open") return fail("not_open");
      if (!state.plan) return fail("no_plan");
      // Both sides must confirm. Confirming your own proposal is not agreement.
      if (state.plan.proposedBy === event.by) return fail("needs_other_participant");
      return ok({
        ...state,
        status: "date_planned",
        fuseExpiresAt: null,
        plan: { ...state.plan, confirmedBy: event.by },
      });
    }

    case "cancel_plan": {
      if (state.status !== "date_planned") return fail("no_confirmed_plan");
      // Re-arms at +72h rather than closing outright, and rather than restoring the
      // original 7 days — a cancelled plan should not reset the clock.
      return ok({
        ...state,
        status: "open",
        fuseExpiresAt: event.at + config.reArmHoursAfterCancelledPlan * HOUR_MS,
        plan: null,
      });
    }

    case "close": {
      if (state.status !== "open" && state.status !== "date_planned") return fail("not_open");
      if (!Number.isInteger(event.template) || event.template < 0 || event.template >= config.templateCount) {
        return fail("invalid_template");
      }
      const line = event.personalLine ?? null;
      if (line !== null && line.length > config.personalLineMaxChars) {
        return fail("personal_line_too_long");
      }
      return ok({
        ...state,
        status: "closed_by_member",
        fuseExpiresAt: null,
        closure: closureFor(event.template, line, event.by, event.at),
      });
    }

    case "sweep": {
      if (state.status !== "open") return fail("not_open");
      if (state.fuseExpiresAt === null || event.at < state.fuseExpiresAt) return fail("not_expired");
      // Closes with the default template so the other person still gets a note.
      return ok({
        ...state,
        status: "closed_fuse",
        fuseExpiresAt: null,
        closure: closureFor(DEFAULT_CLOSURE_TEMPLATE_INDEX, null, null, event.at),
      });
    }

    case "graduate": {
      if (state.status !== "date_planned") return fail("no_confirmed_plan");
      return ok({ ...state, status: "graduated", fuseExpiresAt: null, closure: null });
    }
  }
}

export interface FuseCountdown {
  readonly isRunning: boolean;
  readonly remainingMs: number;
  readonly remainingDays: number;
  /** True inside the final 24h — drives the one honest reminder (§8). */
  readonly isExpiringSoon: boolean;
  readonly isExpired: boolean;
}

/** What the UI needs to render the timer. Display only — never a source of truth. */
export function countdown(
  state: FuseState,
  now: number,
  config: FuseConfig = DEFAULT_FUSE_CONFIG,
): FuseCountdown {
  if (state.fuseExpiresAt === null) {
    return {
      isRunning: false,
      remainingMs: 0,
      remainingDays: 0,
      isExpiringSoon: false,
      isExpired: false,
    };
  }
  const remainingMs = state.fuseExpiresAt - now;
  return {
    isRunning: remainingMs > 0,
    remainingMs: Math.max(0, remainingMs),
    remainingDays: Math.max(0, Math.ceil(remainingMs / (24 * HOUR_MS))),
    isExpiringSoon: remainingMs > 0 && remainingMs <= config.warningHoursBeforeExpiry * HOUR_MS,
    isExpired: remainingMs <= 0,
  };
}

/** Chats the cron sweep should close on this tick (§6.2). */
export function needsSweep(state: FuseState, now: number): boolean {
  return state.status === "open" && state.fuseExpiresAt !== null && now >= state.fuseExpiresAt;
}

/** Chats owed the 24-hour warning, content-blind (§8). */
export function needsExpiryWarning(
  state: FuseState,
  now: number,
  config: FuseConfig = DEFAULT_FUSE_CONFIG,
): boolean {
  return countdown(state, now, config).isExpiringSoon;
}
