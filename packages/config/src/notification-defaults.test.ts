import { describe, expect, it } from "vitest";

import { NOTIFICATION_DEFAULTS } from "./notifications";

/**
 * No event may default to email.
 *
 * Kevin's decision, 2026-08-26, and the kind that decays quietly: the mechanism
 * is built and works, so adding `"email"` to a row is a one-word change that
 * nothing else would question. The failure would not be a bug — it would be an
 * event quietly starting to put itself in members' mailboxes, where it persists,
 * is searchable, and syncs to machines they do not control.
 *
 * Turning this on for an event is a §8 decision, not a code change. If it is
 * ever taken, this test is the thing to update FIRST, deliberately, with the
 * event named.
 */
describe("email is opt-in, never a default", () => {
  it.each(Object.entries(NOTIFICATION_DEFAULTS))(
    "%s does not default to email",
    (_event, channels) => {
      expect(channels).not.toContain("email");
    },
  );

  /** And the defaults are still doing something, rather than all being empty. */
  it("still defaults to something", () => {
    for (const channels of Object.values(NOTIFICATION_DEFAULTS)) {
      expect(channels.length).toBeGreaterThan(0);
      expect(channels).toContain("in_app");
    }
  });
});
