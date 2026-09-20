import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DRAFT_COPY, NOTIFY_NUDGE_STORAGE_KEY } from "@plusone/config";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const nudge = strip(read("./notify-nudge.tsx"));
const toggle = strip(read("./settings/push-toggle.tsx"));

/**
 * Kevin asked for something so testers would not have to remember to turn
 * notifications on. The landmine is that the obvious build spends a thing that
 * cannot be got back.
 */
describe("the nudge never spends the one prompt", () => {
  it("finds the component", () => {
    expect(nudge).toMatch(/export function NotifyNudge/);
    expect(nudge.length).toBeGreaterThan(400);
  });

  it("NEVER asks for the permission", () => {
    // THE WHOLE POINT. push-toggle refuses to prompt on arrival because
    // "dismissing it on iOS or Firefox is permanent for the origin — there is
    // no second ask", and a dialogue before somebody has looked at the app is
    // the one they dismiss by reflex. A nudge that prompted would spend that
    // single chance on the worst possible moment.
    expect(nudge).not.toMatch(/requestPermission/);
    expect(nudge).not.toMatch(/requestNativePush/);
  });

  it("reads the state instead, which is free", () => {
    // Notification.permission and the native checkPermissions both report
    // without prompting. That is what lets it decide whether to appear.
    expect(nudge).toMatch(/Notification\.permission === "default"/);
    expect(nudge).toMatch(/nativePushPermission\(\)/);
  });

  it("points at the screen where the real button is", () => {
    // Next to the privacy note about what a lock screen shows, which somebody
    // should have read before pressing.
    expect(nudge).toMatch(/href="\/app\/settings\/notifications"/);
  });

  it("leaves the asking where it was", () => {
    // The toggle is still the only thing in the app that requests it.
    expect(toggle).toMatch(/requestNativePush|requestPermission/);
  });

  it("says nothing to somebody who already decided", () => {
    // Granted: they do not need telling. Denied: this card cannot undo it, and
    // nagging about a decision it cannot change is just noise.
    expect(nudge).toMatch(/undecided !== true/);
    expect(nudge).toMatch(/"prompt" \|\| state === "prompt-with-rationale"/);
  });

  it("says nothing where there is nothing to turn on", () => {
    // Safari in a browser tab has no Notification at all — an iPhone has the
    // three only once the site is installed.
    expect(nudge).toMatch(/"Notification" in window/);
    expect(nudge).toMatch(/"PushManager" in window/);
    expect(nudge).toMatch(/"serviceWorker" in navigator/);
  });

  it("renders nothing until it knows", () => {
    // Rendering first and hiding afterwards flashes a card at somebody who
    // turned notifications on weeks ago.
    expect(nudge).toMatch(/flags === null \|\| undecided !== true/);
  });

  it("stays dismissed, on the device and nowhere else", () => {
    // Which prompts a particular person has been shown is behaviour, and
    // HINTS_STORAGE_KEY carries the argument for why none of it is in the
    // database.
    expect(nudge).toMatch(/useLocalFlags\(NOTIFY_NUDGE_STORAGE_KEY\)/);
    expect(NOTIFY_NUDGE_STORAGE_KEY).toMatch(/^plusone\./);
    expect(nudge).not.toMatch(/supabase|rpc\(|fetch\(/);
  });

  it("dismisses itself when acted on, not only when refused", () => {
    // Otherwise somebody who turns them on comes back to a card about the thing
    // they have just done.
    const link = /<Link[\s\S]*?<\/Link>/.exec(nudge)?.[0] ?? "";
    expect(link).toMatch(/onClick=\{\(\) => add\("seen"\)\}/);
  });

  it("offers a refusal that is not the browser's", () => {
    // "Not now" dismisses our card and spends nothing. A member who says no
    // here can still turn them on later; a member who says no to the OS cannot.
    expect(DRAFT_COPY.app.notifyNudgeDismiss).toMatch(/not now/i);
  });

  it("says what they would get rather than asking to be enabled", () => {
    // Somebody who has not gone looking does not know what "notifications"
    // would even be about here.
    const said = `${DRAFT_COPY.app.notifyNudgeHeading} ${DRAFT_COPY.app.notifyNudgeBody}`;
    expect(said).toMatch(/replies|connect|message|Drop/i);
    // And it does not promise what §8 forbids a notification from carrying.
    expect(said).not.toMatch(/HSV|HIV|diagnos/i);
  });
});
