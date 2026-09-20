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

  it("never asks except from a press", () => {
    // Kevin's change, 2026-09-20: the card switches notifications on itself
    // rather than sending somebody to Settings. So it DOES prompt now — and
    // the rule it must still keep is the one push-toggle states: not on
    // arrival, because "dismissing it on iOS or Firefox is permanent for the
    // origin — there is no second ask".
    //
    // A press is the only thing that may reach it. Asserted by walking every
    // effect rather than by the absence of a word, because the dangerous
    // version of this is a call that looks identical and sits in a useEffect.
    expect(nudge).toMatch(/onClick=\{\(\) => start\(async \(\) => setOutcome\(await enablePush/);
    const effects = nudge.match(/useEffect\([\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
    expect(effects.length).toBeGreaterThan(0);
    for (const block of effects) expect(block).not.toMatch(/enablePush\(/);
  });

  it("shows the privacy note before the press, not after", () => {
    // push-toggle's rule was never just "behind a button" — it is "behind a
    // button, ON A SCREEN where somebody has gone looking for it, with the
    // privacy note visible before they press". Switching here instead of
    // redirecting means bringing the note along, or the press is less informed
    // than it was when it lived on the settings screen.
    expect(nudge).toMatch(/C\.pushPrivacyNote/);
    const noteAt = nudge.indexOf("pushPrivacyNote");
    const pressAt = nudge.indexOf("enablePush(vapidPublicKey)");
    expect(noteAt).toBeGreaterThan(-1);
    expect(noteAt).toBeLessThan(pressAt);
  });

  it("leaves on its own once it worked, and only then", () => {
    // Kevin asked for it to go away after telling them. A blocked or failed
    // card stays, because it is telling somebody something they still have to
    // act on.
    expect(nudge).toMatch(/if \(outcome !== "on"\) return;/);
    expect(nudge).toMatch(/setTimeout\(\(\) => add\("seen"\), 4000\)/);
    expect(nudge).toMatch(/clearTimeout\(timer\)/);
  });

  it("does not offer a button that cannot work", () => {
    // Blocked is permanent for the origin on iOS and Firefox, so pressing
    // again does nothing. It says where the way back is instead.
    expect(nudge).toMatch(/outcome === "blocked" \? C\.notifyNudgeBlocked/);
    expect(DRAFT_COPY.app.notifyNudgeBlocked).toMatch(/settings/i);
  });

  it("reads the state instead, which is free", () => {
    // Notification.permission and the native checkPermissions both report
    // without prompting. That is what lets it decide whether to appear.
    expect(nudge).toMatch(/Notification\.permission === "default"/);
    expect(nudge).toMatch(/nativePushPermission\(\)/);
  });

  it("keeps a way to Settings for the cases it cannot fix", () => {
    expect(nudge).toMatch(/href="\/app\/settings\/notifications"/);
  });

  it("shares one definition of turning push on", () => {
    // Sixty lines of subscription machinery — the VAPID conversion, the
    // two-key read, the unsubscribe-on-failure rollback — and two copies is
    // how one gets a fix and the other does not.
    expect(nudge).toMatch(/from "@\/lib\/enable-push"/);
    expect(toggle).toMatch(/from "@\/lib\/enable-push"/);
    // And neither still carries the machinery itself.
    for (const src of [nudge, toggle]) expect(src).not.toMatch(/urlBase64ToUint8Array/);
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
    // they have just done. The success path does it on the timer; the Settings
    // link does it on the way through.
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
