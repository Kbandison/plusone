import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { clientEnvSchema, serverEnvSchema } from "./env";

/**
 * `.env.example` is the only documentation of what a deploy needs.
 *
 * Adding a key to the schema and forgetting the example file produces a deploy
 * that fails at boot with a message about a variable nobody has heard of — and
 * the person hitting it is whoever is deploying, usually not whoever added the
 * key. Removing a key and leaving it in the example is quieter and worse: it
 * looks like a setting.
 */
const EXAMPLE = readFileSync(
  fileURLToPath(new URL("../../../.env.example", import.meta.url)),
  "utf8",
);

/** Keys assigned in .env.example, ignoring comments. */
const documented = new Set(
  EXAMPLE.split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .map((line) => /^([A-Z0-9_]+)=/.exec(line.trim())?.[1])
    .filter((key): key is string => Boolean(key)),
);

const required = [
  ...Object.keys(clientEnvSchema.shape),
  ...Object.keys(serverEnvSchema.shape),
];

describe(".env.example matches the schema", () => {
  it("finds keys in both", () => {
    expect(documented.size).toBeGreaterThan(5);
    expect(required.length).toBeGreaterThan(5);
  });

  it.each(required)("documents %s", (key) => {
    expect(documented.has(key), `${key} is required by the schema but absent from .env.example`).toBe(
      true,
    );
  });

  it("documents nothing the schema does not want", () => {
    const orphans = [...documented].filter((key) => !required.includes(key));
    expect(
      orphans,
      `in .env.example but not in the schema — a setting that does nothing: ${orphans.join(", ")}`,
    ).toEqual([]);
  });

  // Anything without the prefix must never reach the browser bundle
  // (BACKEND.md anti-pattern #1). A secret named NEXT_PUBLIC_ is a secret
  // published to every visitor.
  it("keeps every secret out of the NEXT_PUBLIC_ namespace", () => {
    for (const key of Object.keys(clientEnvSchema.shape)) {
      expect(key.startsWith("NEXT_PUBLIC_"), `${key} is in the CLIENT schema`).toBe(true);
    }
    const serverKeys = Object.keys(serverEnvSchema.shape);
    for (const key of serverKeys) {
      expect(key.startsWith("NEXT_PUBLIC_"), `${key} is server-only but named NEXT_PUBLIC_`).toBe(
        false,
      );
    }
  });

  it("gives every secret-shaped example value an obvious placeholder", () => {
    for (const line of EXAMPLE.split("\n")) {
      const match = /^([A-Z0-9_]+)=(.+)$/.exec(line.trim());
      if (!match) continue;
      const [, key, value] = match;
      if (!/KEY|SECRET|TOKEN/.test(key!)) continue;
      // A real credential committed to .env.example is the worst possible
      // accident this file could carry.
      // A placeholder is either obviously fake (xxxx) or an instruction
      // ("generate a long random string"). Both are fine; a value that looks
      // usable is not.
      expect(value, `${key} looks like a real value`).toMatch(
        /x{3,}|your|change|placeholder|generate|replace|example|<|stub/i,
      );
    }
  });
});
