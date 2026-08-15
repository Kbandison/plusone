import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INTERNAL_PREFIXES, SAFE_PREFIXES, isMemberFacing, memberFacingError } from "./rpc-error";

const MIGRATIONS = join(import.meta.dirname, "../../../../supabase/migrations");

/** Every `raise exception '...'` literal in the schema, as written. */
function raisedMessages(): string[] {
  const found = new Set<string>();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const match of sql.matchAll(/raise exception '([^']+)'/g)) found.add(match[1]!);
  }
  return [...found].sort();
}

const classified = (message: string) =>
  SAFE_PREFIXES.some((p) => message.startsWith(p)) ||
  INTERNAL_PREFIXES.some((p) => message.startsWith(p));

describe("database errors a member can see", () => {
  const messages = raisedMessages();

  it("finds the migrations at all", () => {
    // A silent zero would make the classification test below vacuous.
    expect(messages.length).toBeGreaterThan(20);
  });

  it.each(messages.map((m) => [m]))("%s is classified", (message) => {
    // A new raise exception has to be deliberately marked safe or internal.
    // Failing here is the point: nobody should have to remember this rule.
    expect(
      classified(message),
      `"${message}" is on neither list — classify it in rpc-error.ts`,
    ).toBe(true);
  });

  it("never shows a message that answers a question about someone else", () => {
    // The probe leak, arriving as text rather than as a function grant.
    for (const message of [
      "connect: target is support-only",
      "connect: target is not visible to initiator",
      "connect: both members must belong to the room",
    ]) {
      expect(isMemberFacing(message), message).toBe(false);
      expect(memberFacingError({ message }, "generic")).toBe("generic");
    }
  });

  it("still shows a member what they themselves just hit", () => {
    for (const message of [
      "chat is closed",
      "intention can change again on 2026-09-14",
      "dating re-entry is available on 2026-09-14",
      "connect: daily budget exhausted",
      "the other person still needs to confirm this plan",
      "only the recipient may accept",
    ]) {
      expect(memberFacingError({ message }, "generic"), message).toBe(message);
    }
  });

  it("falls back when there is no message at all", () => {
    expect(memberFacingError(null, "generic")).toBe("generic");
    expect(memberFacingError({ message: "" }, "generic")).toBe("generic");
    expect(memberFacingError({ message: "   " }, "generic")).toBe("generic");
    expect(memberFacingError(undefined, "generic")).toBe("generic");
  });

  it("does not classify an unknown message as safe", () => {
    expect(isMemberFacing("some new rule nobody has thought about")).toBe(false);
  });

  it("has no member-facing action left returning a raw database message", () => {
    // Admin screens deliberately still do: "unknown config key: x" is the
    // useful thing there and the reader is staff. Member surfaces must not.
    const roots = [
      join(import.meta.dirname, "../app/app"),
      join(import.meta.dirname, "../app/onboarding"),
    ];
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
        const source = readFileSync(path, "utf8");
        if (/error:\s*error\.message/.test(source)) offenders.push(path);
      }
    };
    for (const root of roots) walk(root);

    expect(offenders, "these return a raw database message to a member").toEqual([]);
  });
});
