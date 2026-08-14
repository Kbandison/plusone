export {
  DEFAULT_FUSE_CONFIG,
  countdown,
  isPlanComplete,
  needsExpiryWarning,
  needsSweep,
  openChat,
  transition,
} from "./fuse";
export type { FuseCountdown } from "./fuse";

export { TERMINAL_STATUSES } from "./types";
export type {
  ChatStatus,
  ClosureState,
  DatePlan,
  FuseConfig,
  FuseErrorCode,
  FuseEvent,
  FuseResult,
  FuseState,
  PlanState,
} from "./types";
