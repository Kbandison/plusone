import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { METROS, RADIUS, metroCentroid } from "@plusone/config";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const button = strip(read("./update-location.tsx"));
const actions = strip(read("./radius-actions.ts"));
const phone = strip(read("../../onboarding/phone/actions.ts"));
const lib = strip(read("../../../lib/waitlist.ts"));

/**
 * Where the app thinks you are, and the two ways it was stuck.
 *
 * Until 2026-09-20 `set_my_location` had exactly ONE caller — the onboarding
 * radius step — so whatever a browser said that day was permanent. Somebody who
 * refused the prompt, was on a VPN, or moved had no way to correct it, and the
 * app matches on that column.
 *
 * And the waitlist metro, which is the city somebody typed into our own form,
 * was never read by onboarding at all. A member could refuse the prompt and
 * match nobody while another table held their city.
 */
describe("a member can move", () => {
  it("finds the files", () => {
    expect(button).toMatch(/export function UpdateLocation/);
    expect(actions).toMatch(/export async function updateMyLocation/);
  });

  it("writes through set_my_location as the member", () => {
    // Not the service client and not a definer wrapper: the RPC reads
    // auth.uid(), so running it as anybody else would let one account move
    // another's location.
    expect(actions).toMatch(/supabase\.rpc\("set_my_location"/);
    expect(actions).not.toMatch(/serviceClient/);
  });

  it("does not re-check the bounds the RPC owns", () => {
    // set_my_location drops anything out of range rather than storing it. Two
    // copies of that rule is how a screen starts writing what the RPC refuses.
    expect(actions).not.toMatch(/-90|180/);
  });

  it("is its own button, not the slider", () => {
    // saveRadiusSetting deliberately never asks the browser — "a permission
    // prompt on every drag of a slider is a thing people learn to dismiss".
    const save = actions.slice(
      actions.indexOf("export async function saveRadiusSetting"),
      actions.indexOf("export async function updateMyLocation"),
    );
    expect(save.length).toBeGreaterThan(200);
    expect(save).not.toMatch(/set_my_location/);
  });

  it("covers the permission dialogue with a pending state", () => {
    // `pending` from useActionState starts at DISPATCH, which happens after the
    // position resolves — so without this the button does nothing visible for
    // the whole time the dialogue is up. The same bug the onboarding step
    // already carries a paragraph about.
    expect(button).toMatch(/const busy = asking \|\| pending/);
    expect(button).toMatch(/disabled=\{busy\}/);
  });

  it("clears the asking flag even if geolocation throws", () => {
    // Otherwise a throw leaves the button permanently disabled, which is the
    // same dead control by another route.
    expect(button).toMatch(/finally \{[\s\S]{0,80}setAsking\(false\)/);
  });

  it("says nothing until a press", () => {
    // A screen that says "Updated" on load is a claim about an action nobody
    // took.
    expect(button).toMatch(/done && state\.error/);
    expect(button).toMatch(/done && !state\.error/);
  });

  it("shares one definition of asking the device", () => {
    // lib/locate.ts carries the WKFebView timer and the low-accuracy choice,
    // both paid for in real failures. A second copy is how one of them gets
    // fixed and the other does not.
    expect(button).toMatch(/from "@\/lib\/locate"/);
    expect(strip(read("../../onboarding/radius/radius-form.tsx"))).toMatch(/from "@\/lib\/locate"/);
  });
});

describe("the waitlist metro seeds a location, once", () => {
  it("reads the metro through the invitation, and stores no link", () => {
    // WAITLIST_NEVER refuses a user_id on that table: binding an address that
    // merely ASKED about an HSV and HIV app to a member account turns an
    // inference into a fact. Reading a value through and keeping no link does
    // not, and this must stay that way.
    expect(lib).toMatch(/export async function metroForInvite/);
    const fn = lib.slice(lib.indexOf("export async function metroForInvite"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/\.select\("metro"\)/);
    expect(body).not.toMatch(/user_id|update\(/);
  });

  it("refuses elsewhere, which is not a place", () => {
    expect(lib).toMatch(/metro !== "elsewhere"/);
    expect(metroCentroid("elsewhere")).toBeNull();
  });

  it("only ever fills an EMPTY location", () => {
    // The whole safety of doing this at phone verification. It cannot overwrite
    // a real position, and the radius step later overwrites this with one.
    expect(phone).toMatch(/\.is\("location", null\)/);
  });

  it("writes the point in the order PostGIS reads it", () => {
    // POINT(lon lat), not (lat lon). Swapped, Atlanta lands in Antarctica —
    // silently, because both are valid coordinates. Proven against the live
    // schema in a rolled-back transaction: the written point reads back
    // through metro_for as atlanta.
    expect(phone).toMatch(/POINT\(\$\{seed\.lon\} \$\{seed\.lat\}\)/);
  });

  it("is allowed to fail, like the cohort stamp beside it", () => {
    // It writes a column PostgREST would fail the whole request over, on top of
    // an account that already exists and a member who is already signed in.
    const seed = phone.slice(phone.indexOf("const metro = await metroForInvite"));
    expect(seed).toMatch(/console\.error/);
    expect(seed).not.toMatch(/return \{ error/);
  });

  it("gives every real metro a centroid to borrow", () => {
    for (const m of METROS) {
      if (m.id === "elsewhere") continue;
      expect(metroCentroid(m.id), m.id).not.toBeNull();
    }
  });
});

describe("the ladder reaches the people 250 miles stranded", () => {
  it("climbs to 350", () => {
    // Measured against the real waitlist: phoenix 256 mi, jacksonville 285,
    // kansas-city 298, miami 328, san-francisco 347. Seattle is 680 and cannot
    // be fixed by distance.
    expect(RADIUS.ladderMi).toContain(350);
    expect(Math.max(...RADIUS.ladderMi)).toBe(350);
  });

  it("does not raise what a member may CHOOSE", () => {
    // How far the app looks on somebody's behalf when their area is empty is a
    // different question from how far they may ask it to look.
    expect(RADIUS.maxMi).toBe(250);
  });

  it("stays sorted, because resolveRadius climbs it in order", () => {
    expect([...RADIUS.ladderMi]).toEqual([...RADIUS.ladderMi].sort((a, b) => a - b));
  });
});
