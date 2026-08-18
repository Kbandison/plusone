import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const script = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../scripts/${name}`, import.meta.url)), "utf8");

const seed = script("seed-test-members.mjs");
const remove = script("remove-test-members.mjs");
const gate = script("verify-no-test-members.mjs");

/**
 * Seeded members go in the PRODUCTION database, because Decision #4 gives this
 * project one Supabase project and no staging one. Everything about how they
 * are marked and removed follows from that.
 */
describe("test members can always be told apart and taken back out", () => {
  const DOMAIN = "seed.plusone.invalid";

  /**
   * .invalid is reserved by RFC 2606 as permanently unresolvable, so no real
   * member can hold one however they signed up — which is what makes deleting
   * by this domain safe.
   */
  it("marks them with a domain nobody real can have", () => {
    for (const source of [seed, remove, gate]) {
      expect(source).toContain(DOMAIN);
      expect(DOMAIN.endsWith(".invalid")).toBe(true);
    }
  });

  it("removes by that domain and nothing else", () => {
    expect(remove).toMatch(/delete from auth\.users where email like \$1/);
    expect(remove).toMatch(/`%@\$\{DOMAIN\}`/);
    // A delete with no predicate, or one on anything but the domain, would take
    // real members with it.
    expect(remove).not.toMatch(/delete from auth\.users\s*[;`"']/);
    expect(remove).not.toMatch(/delete from public\.profiles/);
  });

  it("checks the removal actually happened", () => {
    expect(remove).toMatch(/select count\(\*\)::int n from auth\.users where email like/);
    expect(remove).toMatch(/process\.exitCode = 1/);
  });

  /** "We forgot to clean up" must not be a state anyone has to remember. */
  it("fails a gate while any survive", () => {
    expect(gate).toMatch(/process\.exit\(1\)/);
    expect(gate).toMatch(/seeded test member/i);
  });

  /** The seeder must never invent a member without the marker. */
  it("gives every seeded member the marker", () => {
    expect(seed).toMatch(/const email = `seed-\$\{id\}@\$\{DOMAIN\}`/);
    expect(seed).toMatch(/insert into auth\.users[\s\S]{0,200}\$2/);
  });

  /** A seed with no location is invisible to every surface in the app. */
  it("places them somewhere", () => {
    expect(seed).toMatch(/ST_MakePoint/);
  });
});
