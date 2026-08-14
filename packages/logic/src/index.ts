/**
 * Pure business logic. Zero UI, zero platform APIs, zero clocks.
 *
 * Every mechanic in this package is a pure function with unit tests, shared
 * unchanged across web, mobile, admin and cron. No mechanic logic may live in a
 * component — that rule is inherited from NoGhost and it is not negotiable.
 *
 * Milestone 3 fills in: drop, connects, modes, referrals, compat, tone.
 *
 * Mechanics are namespaced rather than flattened. Each one is a state machine
 * and each one wants to call its reducer `transition`; flattening would force
 * six increasingly awkward prefixes onto the definitions themselves. Import a
 * namespace here, or the subpath (`@plusone/logic/fuse`) for the bare names.
 */

export * as fuse from "./fuse/index";
export * as onboarding from "./onboarding/index";
export * as verification from "./verification/index";
