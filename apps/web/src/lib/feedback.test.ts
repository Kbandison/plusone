import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { routeShape } from "./feedback";

const SRC = join(import.meta.dirname, "..");
const code = (p: string) =>
  readFileSync(join(SRC, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

describe("a bug report says where, never who", () => {
  /**
   * The trade this makes: `/app/chats/[id]` says exactly as much about WHERE a
   * bug is as the real path, and nothing about who was in the conversation. On
   * this app a conversation is two people and a diagnosis.
   */
  it("strips a uuid out of a path", () => {
    expect(routeShape("/app/chats/3f2a8c1e-9b4d-4f7a-8c2e-1d5b6a9f0e3c")).toBe("/app/chats/[id]");
  });

  it("strips numeric ids", () => {
    expect(routeShape("/app/rooms/42/posts/7")).toBe("/app/rooms/[id]/posts/[id]");
  });

  it("strips a long opaque token", () => {
    // A beta invite code and a waitlist token both live in a URL.
    expect(routeShape("/beta/a1b2c3d4e5f60718")).toBe("/beta/[token]");
  });

  it("keeps ordinary route names, which is what makes it useful", () => {
    // The floor on the other side. A stripper that ate everything would be
    // perfectly private and perfectly useless.
    expect(routeShape("/app/settings/notifications")).toBe("/app/settings/notifications");
    expect(routeShape("/app/browse")).toBe("/app/browse");
    expect(routeShape("/")).toBe("/");
  });

  it("drops query strings and fragments entirely", () => {
    // Where an identifier most often smuggles itself in — ?chat=, ?u=, a token
    // on a confirmation link. There is no useful half worth guessing at.
    expect(routeShape("/app/browse?kids=none&u=3f2a8c1e")).toBe("/app/browse");
    expect(routeShape("/waitlist/confirm?t=secrettoken")).toBe("/waitlist/confirm");
    expect(routeShape("/app/chats/abc#msg-1")).toBe("/app/chats/abc");
  });

  it("never emits something the database would refuse", () => {
    // feedback_page_shape. A caller that skipped the stripping is refused by
    // the constraint, but a stripper that PRODUCED an invalid value would fail
    // the member's report instead of protecting them.
    const shape = /^\/[A-Za-z0-9/_.[\]-]*$/;
    for (const path of [
      "/app/chats/3f2a8c1e-9b4d-4f7a-8c2e-1d5b6a9f0e3c",
      "/app/browse?kids=none",
      "/waitlist/confirm?t=abc",
      "/beta/a1b2c3d4e5f60718",
      "/",
      "/app/settings",
    ]) {
      const out = routeShape(path);
      expect(out, `${path} -> ${out}`).toMatch(shape);
      expect(out.length).toBeLessThanOrEqual(120);
    }
  });
});

describe("the surface is decided in the right order", () => {
  const lib = code("lib/feedback.ts");

  it("checks for a TWA before asking the native platform", () => {
    // A TWA has no window.Capacitor — it is real Chrome — so nativePlatform()
    // correctly answers null there. An order that trusted it first would file
    // every Android TWA report as "browser", losing the one distinction this
    // field exists for: AGENTS.md's rule that a fix verified in one engine is
    // not verified in the other.
    const twaAt = lib.indexOf("inTwa()");
    const nativeAt = lib.indexOf("nativePlatform()");
    expect(twaAt).toBeGreaterThan(-1);
    expect(nativeAt).toBeGreaterThan(-1);
    expect(twaAt).toBeLessThan(nativeAt);
  });
});

describe("feedback is not moderation", () => {
  it("the member form never writes to reports", () => {
    // reports is an accusation about another member, read under a duty of care
    // and routed to a moderator queue. A bug in that queue is bad for both.
    const action = code("app/app/feedback/actions.ts");
    expect(action).toMatch(/submit_feedback/);
    expect(action).not.toMatch(/"reports"|queue_report/);
  });

  it("the body never reaches a log", () => {
    // §9.6. A bug report on this app can quote a message or name a person.
    const action = code("app/app/feedback/actions.ts");
    const logs = [...action.matchAll(/console\.(error|info|warn|log)\(([\s\S]{0,200}?)\)/g)];
    expect(logs.length).toBeGreaterThan(0);
    for (const [, , payload] of logs) {
      expect(payload, "a log line carrying the report body").not.toMatch(/\bbody\b/);
    }
  });
});

describe("the write path is the only one", () => {
  it("no page inserts into feedback directly", () => {
    // The table grants SELECT and no INSERT, so a direct write would fail — but
    // it would fail at runtime, in front of a member, rather than here.
    function tsx(dir: string, acc: string[] = []): string[] {
      for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) tsx(rel, acc);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) acc.push(rel);
      }
      return acc;
    }
    const offenders = tsx("app").filter((f) =>
      /from\("feedback"\)[\s\S]{0,60}\.insert\(/.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });
});
