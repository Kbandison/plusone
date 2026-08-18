/**
 * The last gate before real people arrive.
 *
 * Deliberately NOT part of the per-push CI, and that is the whole design.
 * Seeded test members are supposed to exist while the app is being built, so a
 * check that fails on their presence would leave CI red for weeks — and a
 * red-on-everything CI is a CI nobody reads, which is how `check:sql` sat
 * broken behind a missing dependency without anybody noticing.
 *
 * The risk is not "seeds exist today". It is "seeds still exist on the day
 * strangers can see them". So this runs once, on purpose, at the moment that
 * changes.
 *
 * It runs every gate that can be verified mechanically, then prints the ones
 * that cannot — because a checklist that only lists the automated half reads as
 * a full pass when it is not one.
 */
import { spawnSync } from "node:child_process";

const GATES = [
  "check:sql",
  "check:db",
  "check:admin",
  "check:moderation",
  "check:sweeps",
  "check:walls",
  "check:columns",
  "check:connects",
  "check:referrals",
  "check:safety",
  "check:photos",
  "check:premium",
  "check:config",
  // Last, so its failure is the one left on screen.
  "check:seed",
];

/** Things no script can know. Listed so their absence is visible. */
const BY_HAND = [
  "Every string in DRAFT_COPY has been read. It is unreviewed by default — the quiz, the FAQ, the community guidelines, the profile prompts, the liveness camera, the preferences step and the gender option list are all drafts nobody has approved.",
  "BRAND.legalName is the real legal entity, not a placeholder.",
  "The database password has been rotated since it was last shared.",
  "OTP_PROVIDER is not `stub` in production — that value opens the development sign-in.",
  "LIVENESS_PROVIDER is `aws_rekognition`, not `stub`. A provider that always passes is the fake-profile problem this product exists to prevent.",
  "Counsel has reviewed the privacy policy and terms (Decision #30).",
  "The privacy contact address is a real inbox somebody reads.",
];

if (!process.env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL is required — the database gates cannot run without it.");
  process.exit(1);
}

let failed = 0;
for (const gate of GATES) {
  process.stdout.write(`${gate.padEnd(18)} `);
  const run = spawnSync("pnpm", [gate], { encoding: "utf8" });
  if (run.status === 0) {
    console.log("ok");
  } else {
    failed += 1;
    console.log("FAILED");
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").slice(-6);
    for (const line of output) console.log(`   ${line}`);
  }
}

console.log("\nNot checkable by any script — confirm each one yourself:");
for (const item of BY_HAND) console.log(`  [ ] ${item}`);

if (failed > 0) {
  console.error(`\n${failed} gate(s) failed. Not ready.`);
  process.exit(1);
}
console.log("\nEvery mechanical gate passed. The list above is the rest of it.");
