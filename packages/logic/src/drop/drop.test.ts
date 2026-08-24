import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { INTENTIONS } from "../modes/index";
import {
  DEFAULT_DROP_CONFIG,
  INTENTION_AFFINITY,
  NEUTRAL_QUIZ_COMPAT,
  intentionCompat,
  isEligible,
  quizCompat,
  recencyActive,
  resolveRadius,
  score,
  selectDrop,
  underexposure,
  weightsForPool,
  type DropCandidate,
  type DropViewer,
} from "./index";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const candidate = (over: Partial<DropCandidate> = {}): DropCandidate => ({
  id: "c1",
  distanceMi: 10,
  intention: "long_term",
  quizVector: null,
  lastActiveAt: NOW - DAY,
  timesServed: 0,
  verified: true,
  blocked: false,
  reportPending: false,
  alreadyConnected: false,
  lastServedToViewerAt: null,
  ...over,
});

const viewer = (over: Partial<DropViewer> = {}): DropViewer => ({
  intention: "long_term",
  quizVector: null,
  radiusMi: 50,
  mode: "dating",
  ...over,
});

/** `n` eligible candidates, all within 10 miles. */
const pool = (n: number, over: (i: number) => Partial<DropCandidate> = () => ({})) =>
  Array.from({ length: n }, (_, i) => candidate({ id: `c${i}`, ...over(i) }));

describe("filtering (§6.1 step 1)", () => {
  it.each([
    ["unverified", { verified: false }],
    ["blocked", { blocked: true }],
    ["report pending", { reportPending: true }],
    ["already connected", { alreadyConnected: true }],
    ["inactive for more than 14 days", { lastActiveAt: NOW - 15 * DAY }],
    ["served to this viewer inside 30 days", { lastServedToViewerAt: NOW - 29 * DAY }],
  ])("excludes a candidate who is %s", (_label, over) => {
    expect(isEligible(candidate(over), NOW)).toBe(false);
  });

  it("keeps someone served 31 days ago", () => {
    expect(isEligible(candidate({ lastServedToViewerAt: NOW - 31 * DAY }), NOW)).toBe(true);
  });

  it("keeps someone active 13 days ago", () => {
    expect(isEligible(candidate({ lastActiveAt: NOW - 13 * DAY }), NOW)).toBe(true);
  });
});

describe("the radius ladder (§6.1 step 2)", () => {
  it("stays at the member's radius when the pool is deep enough", () => {
    const { radiusMi } = resolveRadius(pool(12), 50);
    expect(radiusMi).toBe(50);
  });

  it("climbs while the pool is too thin", () => {
    const thin = [...pool(3), ...pool(20, (i) => ({ id: `far${i}`, distanceMi: 120 }))];
    const { radiusMi, pool: found } = resolveRadius(thin, 50);
    expect(radiusMi).toBe(150);
    expect(found.length).toBeGreaterThanOrEqual(DEFAULT_DROP_CONFIG.minPool);
  });

  it("reports the radius that found the pool, not the one it gave up at", () => {
    // Two people, both inside the member's own 50 miles. The ladder climbs to
    // 250 and finds nobody new, and the notice it drives reads "Not many people
    // within 50 miles yet — showing within 250 miles." Both halves of that are
    // false: the two people ARE within 50, and none of them is 250 away.
    const { radiusMi, pool: found } = resolveRadius(pool(2), 50);
    expect(radiusMi).toBe(50);
    expect(found).toHaveLength(2);
  });

  it("does report a wider radius when the wider radius is what found people", () => {
    const near = pool(2);
    const far = pool(20, (i) => ({ id: `far${i}`, distanceMi: 120 }));
    const { radiusMi } = resolveRadius([...near, ...far], 50);
    expect(radiusMi).toBeGreaterThan(50);
  });

  it("never climbs below the member's own radius", () => {
    const { radiusMi } = resolveRadius(pool(2), 200);
    expect(radiusMi).toBeGreaterThanOrEqual(200);
  });

  it("flags the expansion only when expanding actually found somebody", () => {
    // Thin AND local: nobody new was found further out, so the honesty line
    // must stay quiet rather than claim a search that changed nothing.
    const thinButLocal = selectDrop(viewer(), pool(2), NOW);
    expect(thinButLocal.radiusExpanded).toBe(false);
    expect(thinButLocal.radiusUsedMi).toBe(50);

    // Thin locally, deep further out: this is what the line is for.
    const reached = selectDrop(
      viewer(),
      [...pool(2), ...pool(20, (i) => ({ id: `far${i}`, distanceMi: 120 }))],
      NOW,
    );
    expect(reached.radiusExpanded).toBe(true);
    expect(reached.radiusUsedMi).toBeGreaterThan(50);

    const local = selectDrop(viewer(), pool(12), NOW);
    expect(local.radiusExpanded).toBe(false);
    expect(local.radiusUsedMi).toBe(50);
  });
});

describe("scoring components", () => {
  // §6.1: "never a hard wall between dating intentions". A zero would be a wall
  // pretending to be a preference — some members invisible to each other for
  // good.
  it("leaves no pair of intentions at zero", () => {
    for (const a of INTENTIONS) {
      for (const b of INTENTIONS) {
        expect(intentionCompat(a, b), `${a} -> ${b}`).toBeGreaterThan(0);
      }
    }
  });

  it("is symmetric", () => {
    for (const a of INTENTIONS) {
      for (const b of INTENTIONS) {
        expect(INTENTION_AFFINITY[a][b]).toBe(INTENTION_AFFINITY[b][a]);
      }
    }
  });

  it("scores a match with itself highest", () => {
    for (const a of INTENTIONS) {
      for (const b of INTENTIONS) {
        if (a !== b) expect(intentionCompat(a, a)).toBeGreaterThan(intentionCompat(a, b));
      }
    }
  });

  // The quiz is skippable (§7.2). Scoring a skip as total incompatibility would
  // make it compulsory in everything but name.
  it("treats a skipped quiz as neutral, not incompatible", () => {
    expect(quizCompat(null, [1, 0, 1])).toBe(NEUTRAL_QUIZ_COMPAT);
    expect(quizCompat([1, 0, 1], null)).toBe(NEUTRAL_QUIZ_COMPAT);
    expect(quizCompat(null, null)).toBe(NEUTRAL_QUIZ_COMPAT);
  });

  it("scores identical vectors at 1 and opposite ones at 0", () => {
    expect(quizCompat([1, 1], [1, 1])).toBeCloseTo(1);
    expect(quizCompat([1, 1], [-1, -1])).toBeCloseTo(0);
    expect(quizCompat([1, 0], [0, 1])).toBeCloseTo(0.5);
  });

  it("falls back to neutral on mismatched vector lengths", () => {
    expect(quizCompat([1, 0], [1, 0, 1])).toBe(NEUTRAL_QUIZ_COMPAT);
  });

  it("decays recency across the window", () => {
    expect(recencyActive(NOW, NOW, 14)).toBe(1);
    expect(recencyActive(NOW - 7 * DAY, NOW, 14)).toBeCloseTo(0.5);
    expect(recencyActive(NOW - 14 * DAY, NOW, 14)).toBe(0);
    expect(recencyActive(NOW - 99 * DAY, NOW, 14)).toBe(0);
  });

  // Without this the same handful win every drop in a small city, and everyone
  // else concludes the app is empty.
  it("rewards profiles that have been served less", () => {
    expect(underexposure(0)).toBe(1);
    expect(underexposure(1)).toBe(0.5);
    expect(underexposure(9)).toBeCloseTo(0.1);
    expect(underexposure(0)).toBeGreaterThan(underexposure(5));
  });

  it("keeps every score inside 0..1", () => {
    for (const c of [candidate(), candidate({ timesServed: 50, lastActiveAt: NOW - 13 * DAY })]) {
      const s = score(viewer(), c, NOW);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });
});

// §6.5, in the spec's own words: "Referral state NEVER feeds drop scoring,
// browse rank, or any matching surface (assert in tests)."
describe("referrals cannot reach the drop", () => {
  /** Declared field names only — the comment saying there are none is not one. */
  function fieldsOf(interfaceName: string): string[] {
    const source = readFileSync(fileURLToPath(new URL("./types.ts", import.meta.url)), "utf8");
    const block = new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`).exec(
      source,
    )?.[1];
    expect(block, `${interfaceName} not found`).toBeDefined();
    return [...(block ?? "").matchAll(/^\s*readonly (\w+)/gm)].map((m) => m[1] as string);
  }

  it("has no referral field to read", () => {
    for (const name of ["DropCandidate", "DropViewer"]) {
      const fields = fieldsOf(name);
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        expect(field, `${name}.${field}`).not.toMatch(/referr|invite|conversion|founding/i);
      }
    }
  });

  it("scores two candidates identically whatever is attached to them", () => {
    const plain = candidate({ id: "a" });
    // Referral fields do not exist on the type, so this is the closest a caller
    // could get: extra properties smuggled onto the object.
    const wellConnected = {
      ...candidate({ id: "b" }),
      referralConversions: 47,
      isFoundingMember: true,
    } as DropCandidate;

    expect(score(viewer(), wellConnected, NOW).score).toBe(score(viewer(), plain, NOW).score);
  });

  it("orders a drop the same with and without those properties", () => {
    const base = pool(6, (i) => ({ timesServed: i }));
    const boosted = base.map((c, i) => ({ ...c, referralConversions: 100 - i }) as DropCandidate);
    expect(selectDrop(viewer(), boosted, NOW).cards.map((c) => c.id)).toEqual(
      selectDrop(viewer(), base, NOW).cards.map((c) => c.id),
    );
  });

  it("never mentions referrals in the scorer", () => {
    const source = readFileSync(fileURLToPath(new URL("./drop.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/referr|invite|conversion|founding/i);
  });
});

describe("selecting the drop", () => {
  it("serves three", () => {
    expect(selectDrop(viewer(), pool(20), NOW).cards).toHaveLength(3);
  });

  // §6.1 step 4 — serving two real people beats serving three when the third
  // last opened the app in March.
  it("serves fewer rather than padding a thin pool", () => {
    expect(selectDrop(viewer(), pool(2), NOW).cards).toHaveLength(2);
    expect(selectDrop(viewer(), [], NOW).cards).toHaveLength(0);
  });

  it("never pads with a filtered-out profile", () => {
    const one = [
      candidate({ id: "real" }),
      candidate({ id: "stale", lastActiveAt: NOW - 40 * DAY }),
    ];
    const result = selectDrop(viewer(), one, NOW);
    expect(result.cards.map((c) => c.id)).toEqual(["real"]);
  });

  // Decision #11 — the count does not vary by payment or intention. Nothing
  // about paying is a parameter here, so it cannot.
  it("gives every viewer the same count", () => {
    const deep = pool(30);
    for (const intention of INTENTIONS) {
      expect(selectDrop(viewer({ intention }), deep, NOW).cards).toHaveLength(3);
    }
  });

  it("ranks higher scores first", () => {
    const result = selectDrop(
      viewer(),
      pool(10, (i) => ({ timesServed: i })),
      NOW,
    );
    const scores = result.cards.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  // A member who reloads must not see a different three.
  it("is deterministic for the same inputs", () => {
    const candidates = pool(12, (i) => ({ timesServed: i % 3 }));
    expect(selectDrop(viewer(), candidates, NOW)).toEqual(selectDrop(viewer(), candidates, NOW));
  });

  it("breaks ties stably rather than arbitrarily", () => {
    const identical = pool(6).map((c, i) => ({ ...c, id: `id${5 - i}` }));
    const first = selectDrop(viewer(), identical, NOW).cards.map((c) => c.id);
    const shuffled = [...identical].reverse();
    expect(selectDrop(viewer(), shuffled, NOW).cards.map((c) => c.id)).toEqual(first);
  });

  // §6.1 step 5 — the support-only viewer gets the redacted variant.
  it("flags the preview variant for a support-only viewer", () => {
    expect(selectDrop(viewer({ mode: "support_only" }), pool(9), NOW).preview).toBe(true);
    expect(selectDrop(viewer(), pool(9), NOW).preview).toBe(false);
  });

  it("runs the same pipeline for a preview as for a drop", () => {
    const candidates = pool(9, (i) => ({ timesServed: i }));
    const normal = selectDrop(viewer(), candidates, NOW);
    const preview = selectDrop(viewer({ mode: "support_only" }), candidates, NOW);
    expect(preview.cards).toEqual(normal.cards);
  });

  it("reports the pool it drew from", () => {
    expect(selectDrop(viewer(), pool(7), NOW).poolSize).toBe(7);
  });

  it("never mutates its inputs", () => {
    const candidates = pool(5);
    const snapshot = structuredClone(candidates);
    selectDrop(viewer(), candidates, NOW);
    expect(candidates).toEqual(snapshot);
  });

  it("uses the locked config defaults", () => {
    expect(DEFAULT_DROP_CONFIG.count).toBe(3);
    expect(DEFAULT_DROP_CONFIG.minPool).toBe(12);
    expect(DEFAULT_DROP_CONFIG.weights).toEqual({
      intentionCompat: 0.4,
      quizCompat: 0.3,
      recencyActive: 0.2,
      underexposure: 0.1,
    });
  });
});

/**
 * Decision #10 — "tightens as density grows". It was a sentence in the spec for
 * a long time and these are the tests that make it a mechanism.
 */
describe("intention weighting tightens with local density", () => {
  const base = DEFAULT_DROP_CONFIG.weights;
  const { minPool } = DEFAULT_DROP_CONFIG;
  const { saturationPool, maxIntentionCompat } = DEFAULT_DROP_CONFIG.density;

  it("does not move at all in a thin area", () => {
    // The same object, not merely an equal one — a caller can tell that nothing
    // happened. This is also every area at launch.
    expect(weightsForPool(0)).toBe(base);
    expect(weightsForPool(minPool - 1)).toBe(base);
    expect(weightsForPool(minPool)).toBe(base);
  });

  it("reaches the ceiling at saturation and stops there", () => {
    expect(weightsForPool(saturationPool).intentionCompat).toBeCloseTo(maxIntentionCompat, 10);
    // Twice as dense is not twice as tight.
    expect(weightsForPool(saturationPool * 2).intentionCompat).toBeCloseTo(maxIntentionCompat, 10);
    expect(weightsForPool(100_000).intentionCompat).toBeCloseTo(maxIntentionCompat, 10);
  });

  it("climbs linearly between the two", () => {
    const midway = minPool + (saturationPool - minPool) / 2;
    expect(weightsForPool(midway).intentionCompat).toBeCloseTo(
      base.intentionCompat + (maxIntentionCompat - base.intentionCompat) / 2,
      10,
    );
  });

  it("moves intention and nothing else", () => {
    // The scorer normalises by the weight total, so shifting the mix IS raising
    // one weight. Touching the others would rescale rather than reweight.
    const dense = weightsForPool(saturationPool);
    expect(dense.quizCompat).toBe(base.quizCompat);
    expect(dense.recencyActive).toBe(base.recencyActive);
    expect(dense.underexposure).toBe(base.underexposure);
    expect(dense.intentionCompat).toBeGreaterThan(base.intentionCompat);
  });

  it("never loosens, however the ceiling is misconfigured", () => {
    // An admin can reach these through §7.3. A ceiling under the launch weight
    // is a mistake, and honouring it would mean the densest areas serving the
    // worst matches — the exact inversion of the decision.
    const config = {
      ...DEFAULT_DROP_CONFIG,
      density: { ...DEFAULT_DROP_CONFIG.density, maxIntentionCompat: 0.1 },
    };
    expect(weightsForPool(saturationPool, config).intentionCompat).toBe(base.intentionCompat);
  });

  it("does not divide by zero when saturation sits at or below the floor", () => {
    const config = {
      ...DEFAULT_DROP_CONFIG,
      density: { ...DEFAULT_DROP_CONFIG.density, saturationPool: minPool },
    };
    const w = weightsForPool(minPool + 1, config);
    expect(Number.isFinite(w.intentionCompat)).toBe(true);
    expect(w.intentionCompat).toBeCloseTo(maxIntentionCompat, 10);
  });

  it("weights the pool the ladder settled on, not everyone eligible", () => {
    // A thin area that climbed to 250 miles to find people has not become dense
    // by climbing. Everyone here is far away, so the pool is what the widest
    // rung produced — and it is still under the floor.
    const far = Array.from({ length: 8 }, (_, i) => candidate({ id: `far${i}`, distanceMi: 240 }));
    const result = selectDrop(viewer(), far, NOW);
    expect(result.radiusExpanded).toBe(true);
    expect(result.weightsUsed).toBe(base);
  });

  it("reports what it actually weighted", () => {
    const many = Array.from({ length: saturationPool }, (_, i) =>
      candidate({ id: `c${i}`, distanceMi: 5 }),
    );
    const result = selectDrop(viewer(), many, NOW);
    expect(result.poolSize).toBe(saturationPool);
    expect(result.weightsUsed.intentionCompat).toBeCloseTo(maxIntentionCompat, 10);
  });

  /** The behaviour the decision is actually about, rather than the arithmetic. */
  it("prefers the matching intention in a dense area and the fresher face in a thin one", () => {
    // Two candidates, each winning one axis. `right` matches the viewer's
    // intention and has been served often and was active a while ago; `wrong`
    // is a poor intention match but new and recently active.
    const right = candidate({
      id: "right",
      intention: "long_term",
      timesServed: 40,
      // At the edge of the activity window: still eligible, recency exactly 0.
      // At 10 days it scores 0.29 there, which is enough to win on the launch
      // weights on its own and the test proves nothing.
      lastActiveAt: NOW - 14 * DAY,
    });
    const wrong = candidate({
      id: "wrong",
      intention: "casual",
      timesServed: 0,
      lastActiveAt: NOW,
    });
    const filler = (i: number) => candidate({ id: `f${i}`, intention: "casual", timesServed: 40 });

    const thin = selectDrop(viewer(), [right, wrong], NOW);
    expect(thin.poolSize).toBeLessThanOrEqual(minPool);
    expect(thin.cards[0]?.id).toBe("wrong");

    // Same two, now in a crowd. Nothing about either changed.
    const crowd = [right, wrong, ...Array.from({ length: saturationPool }, (_, i) => filler(i))];
    const dense = selectDrop(viewer(), crowd, NOW);
    expect(dense.cards[0]?.id).toBe("right");
  });
});
