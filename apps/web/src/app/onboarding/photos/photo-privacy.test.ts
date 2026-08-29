import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const HERE = join(import.meta.dirname);
const ROOT = join(HERE, "../../../../../..");
const MIGRATIONS = join(ROOT, "supabase/migrations");

const read = (p: string) => readFileSync(join(HERE, p), "utf8");
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(--|\/\/|\*)/.test(line))
    .join("\n");

const migrationNames = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
const allMigrations = migrationNames
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");
const mine = withoutComments(
  readFileSync(join(MIGRATIONS, "20260829002000_a_photo_at_a_time.sql"), "utf8"),
);
const actions = withoutComments(read("actions.ts"));
const form = withoutComments(read("photos-form.tsx"));

/**
 * Per-photo privacy (server 18b).
 *
 * The floor first, per WSL's finding on `design-system.test.ts`: every
 * assertion below is "this string is present", so a suite reading nothing at
 * all would pass forever. If these numbers are wrong the paths are wrong and
 * nothing underneath means anything.
 */
describe("the suite is actually reading the files it checks", () => {
  it("read the migrations and the source", () => {
    expect(migrationNames.length).toBeGreaterThan(80);
    expect(mine.length).toBeGreaterThan(2000);
    expect(actions.length).toBeGreaterThan(2000);
    expect(form.length).toBeGreaterThan(5000);
  });
});

describe("a lapse must never make a member more visible", () => {
  it("gates SETTING an override, not keeping one", () => {
    // The trigger returns early on null — clearing back to "follow the
    // profile" is the free model and must stay reachable for somebody whose
    // subscription has ended, or they are stranded in a state they cannot edit.
    expect(mine).toMatch(/if new\.photo_privacy is null then\s*\n\s*return new;/);
    expect(mine).toMatch(/if not public\.is_premium\(v_uid\) then/);
  });

  it("has nothing anywhere that clears the column automatically", () => {
    // The failure this prevents: a card expires and photographs of people who
    // are ill quietly become clear. Checked across EVERY migration, not just
    // mine, because the next one to do this would not be in this file.
    expect(allMigrations).not.toMatch(/set\s+photo_privacy\s*=\s*null/i);
    expect(allMigrations).not.toMatch(
      /update\s+public\.profile_photos[\s\S]{0,200}photo_privacy\s*=\s*null/i,
    );
  });

  it("keeps the premium-expiry sweep away from photos entirely", () => {
    const cron = readFileSync(join(HERE, "../../api/cron/premium-expiry/route.ts"), "utf8");
    expect(cron).not.toMatch(/profile_photos|photo_privacy/);
  });
});

describe("the gate is on the table, because the action is not the only writer", () => {
  it("puts a trigger on profile_photos", () => {
    // 20260813000700 grants select/insert/update/delete on profile_photos to
    // authenticated as a WHOLE TABLE, so a member can PATCH this column
    // straight through PostgREST. A check in the action alone is decoration.
    expect(mine).toMatch(/create trigger profile_photos_privacy_is_premium/);
    expect(mine).toMatch(/before insert or update on public\.profile_photos/);
  });

  it("keeps the action's check as courtesy and says so", () => {
    expect(actions).toMatch(/i_am_premium/);
  });
});

describe("the view cannot say one thing and show another", () => {
  it("resolves privacy per photo, falling back to the profile", () => {
    expect(mine).toMatch(/coalesce\(ph\.photo_privacy, p\.photo_privacy\)/);
  });

  it("uses the same resolution in BOTH arms", () => {
    // One arm picks the path, the other reports is_blurred. If they drift the
    // app renders a clear photo and labels it blurred — or worse, the reverse.
    const uses = mine.match(/coalesce\(ph\.photo_privacy, p\.photo_privacy\)/g) ?? [];
    expect(uses.length).toBe(2);
  });

  it("never returns both variants", () => {
    // The property the view has always had: one resolved path, never a clear
    // one alongside a blurred one for the caller to choose between.
    expect(mine).not.toMatch(/ph\.storage_path as .*,\s*ph\.blurred_path as/);
  });
});

describe("which photo is first is now a privacy decision, so the screen says so", () => {
  it("renders the sentence on the gallery", () => {
    // photosFor is .eq("position", 0) — every card in the app shows the first
    // photo. Deliberately NOT changed to pick the first clear one: that would
    // raise a member's visibility without their asking.
    expect(form).toMatch(/C\.firstIsTheCard/);
  });
});
