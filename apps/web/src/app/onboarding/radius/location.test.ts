import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DRAFT_COPY } from "@plusone/config";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const actions = read("./actions.ts")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
const form = read("./radius-form.tsx");
const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../../../supabase/migrations/20260818000400_a_location_to_measure_from.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

/**
 * `profiles.location` existed from the first migration. round_location()
 * coarsened it, a trigger applied that, distance_mi() computed from it,
 * visible_profiles exposed it, and Browse and the Drop both filtered on it.
 *
 * Nothing ever wrote one. So distance_mi was null for every member against
 * every other member, `distance_mi <= radius` was null rather than true, and
 * both surfaces returned nothing — which reads as "nobody is near you yet"
 * rather than as a missing write.
 */
describe("a member gets a location to be measured from", () => {
  it("writes one when finishing the radius step", () => {
    expect(actions).toMatch(/rpc\("set_my_location", \{ p_lat: lat, p_lon: lon \}\)/);
  });

  /**
   * Best effort. A refused prompt, a timeout, or no Vercel headers all leave a
   * member with no location — and they must still finish onboarding. They match
   * nobody until one arrives, which is where they were standing anyway.
   */
  it("never blocks finishing on it", () => {
    expect(actions).toMatch(/if \(Number\.isFinite\(lat\) && Number\.isFinite\(lon\)\)/);
    const after = actions.slice(actions.indexOf("set_my_location"));
    expect(after).toMatch(/search_radius_mi: radius/);
  });

  /**
   * The prompt fires on SUBMIT, not on load. A permission dialogue that appears
   * the instant a screen renders is the one people refuse by reflex.
   */
  it("asks the device only when the member presses the button", () => {
    expect(form).toMatch(/action=\{async \(formData\) => \{[\s\S]{0,200}await locate\(\)/);
    expect(form).not.toMatch(/useEffect\([\s\S]{0,120}getCurrentPosition/);
  });

  it("falls back to the coarse position from the request", () => {
    expect(form).toMatch(/resolve\(approximate \?\? null\)/);
    expect(read("../../../lib/dial-code.ts")).toMatch(/x-vercel-ip-latitude/);
  });

  /** Rounded to ~1km before storage regardless, so a GPS fix is wasted battery. */
  it("does not ask for high accuracy", () => {
    expect(form).toMatch(/enableHighAccuracy: false/);
  });

  it("tells the member what is being asked and what is kept", () => {
    expect(DRAFT_COPY.radius.locationHint).toMatch(/round/i);
    expect(DRAFT_COPY.radius.locationHint).toMatch(/never stored|not stored/i);
  });
});

describe("the location wall", () => {
  /** A wrong location is worse than none: none reads as "nobody near you". */
  it("refuses coordinates that are not a place", () => {
    expect(migration).toMatch(/p_lat < -90 or p_lat > 90/);
    expect(migration).toMatch(/p_lon < -180 or p_lon > 180/);
  });

  it("leaves the coarsening to the trigger, so there is one definition of it", () => {
    const body = migration.slice(migration.indexOf("update public.profiles"));
    expect(body).not.toMatch(/round\(/);
  });

  it("can only write the caller's own row", () => {
    expect(migration).toMatch(/where id = v_uid/);
    expect(migration).toMatch(/security invoker/);
  });
});

/**
 * A member in New York was stored at 37.75, -97.82 — a field in Kansas, which
 * is what a geolocation database returns for "somewhere in the United States".
 * They then matched nobody, a thousand miles from every other member, with
 * nothing on screen suggesting why.
 *
 * Storing that is worse than storing nothing: nothing reads as "no matches
 * near you yet" and is fixed by granting the prompt, while a confident wrong
 * answer reads as an empty product.
 */
describe("a country is not a location", () => {
  const lib = read("../../../lib/dial-code.ts");

  it("refuses the published country centroids", () => {
    expect(lib).toMatch(/COUNTRY_CENTROIDS/);
    expect(lib).toMatch(/37\.751, -97\.822/);
    expect(lib).toMatch(/isCountryCentroid\(lat, lon\)/);
  });

  /** A city header means the lookup got finer than the country. */
  it("requires the lookup to have resolved past the country", () => {
    expect(lib).toMatch(/x-vercel-ip-city/);
  });

  /**
   * "We used your rough area" and "we have no idea where you are" have
   * completely different consequences, and only the second leaves the app
   * empty. A member who is told the first while the second is true finishes
   * onboarding into nothing.
   */
  it("tells the two failures apart on screen", () => {
    expect(form).toMatch(/setOutcome\(approximate \? "approximate" : "unknown"\)/);
    expect(form).toMatch(/outcome === "unknown"/);
    expect(DRAFT_COPY.radius.locationUnknown).toMatch(/could not/i);
    expect(DRAFT_COPY.radius.locationUnknown).toMatch(/allow/i);
  });
});
