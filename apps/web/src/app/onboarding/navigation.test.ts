import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { onboarding } from "@plusone/logic";

const here = fileURLToPath(new URL(".", import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(entry) && !entry.includes(".test.") ? [full] : [];
  });
const all = files(here);

/**
 * Every step used to end with `redirect("/onboarding")`, which resolves to the
 * first step the member has NOT settled. That is right for arriving at
 * onboarding and wrong for finishing a step: once Back existed, a member who
 * walked back to fix their name pressed Continue and was thrown to the far end
 * of the flow, past every screen they had already done.
 */
describe("Continue advances one step, it does not resolve", () => {
  const actions = all.filter((f) => f.endsWith("/actions.ts"));

  it("finds the step actions", () => {
    expect(actions.length).toBeGreaterThanOrEqual(8);
  });

  it("never sends a finished step back to the resolver", () => {
    const offenders = actions.filter((f) =>
      /redirect\("\/onboarding"\)/.test(
        readFileSync(f, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*$/gm, ""),
      ),
    );
    // liveness is allowed one: `already_verified` genuinely means "work out
    // where this member belongs", which is the resolver's actual job.
    expect(offenders.map((f) => f.replace(here, ""))).toEqual(["liveness/actions.ts"]);
  });

  it("walks the whole flow one step at a time", () => {
    const seen: onboarding.OnboardingStep[] = [];
    let step: onboarding.OnboardingStep = "phone";
    while (step !== "done" && seen.length < 20) {
      seen.push(step);
      step = onboarding.nextStep(step);
    }
    expect(seen).toEqual([...onboarding.ONBOARDING_STEPS].slice(0, -1));
  });
});

/**
 * `next build` caught this and `pnpm typecheck` did not.
 *
 * step-actions is imported by the step FORMS, which are Client Components. It
 * reached for STEP_ROUTES in lib/onboarding — a module that imports
 * `next/headers` for requireStep — so the entire server module, and supabase
 * with it, was pulled into the browser bundle and the build failed on
 * `cookies()`. The map is a constant and now lives on its own.
 */
describe("nothing a Client Component imports drags the server in", () => {
  it("keeps step-actions off the server-only modules", () => {
    const source = readFileSync(join(here, "step-actions.tsx"), "utf8");
    expect(source).toMatch(/from "@\/lib\/step-routes"/);
    expect(source).not.toMatch(/from "@\/lib\/onboarding"/);
    expect(source).not.toMatch(/from "@\/lib\/supabase"/);
  });

  it("keeps the route map itself free of server APIs", () => {
    // Comments here name the API this file exists to stay away from.
    const routes = readFileSync(
      fileURLToPath(new URL("../../lib/step-routes.ts", import.meta.url)),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(routes).not.toMatch(/next\/headers/);
    expect(routes).not.toMatch(/server-only/);
    expect(routes).not.toMatch(/supabase/i);
  });
});

/**
 * Back sat above the heading, at the top of the screen, where it was easy to
 * miss and a long way from the decision it undoes. A member finishing a step is
 * looking at the bottom of the form.
 */
describe("the way back sits with the way forward", () => {
  const withActions = all.filter((f) => readFileSync(f, "utf8").includes("<StepActions"));

  it("is on every step that has one", () => {
    // Every step except phone and liveness, which are verification and have no
    // Back, and the pages, which delegate to their forms.
    expect(withActions.length).toBeGreaterThanOrEqual(8);
  });

  it("puts the forward action first, so a keyboard reaches it first", () => {
    const shell = readFileSync(join(here, "step-actions.tsx"), "utf8");
    const row = shell.slice(shell.indexOf("export function StepActions"));
    expect(row.indexOf("{children}")).toBeLessThan(row.indexOf("<BackLink"));
  });

  it("is no longer rendered at the top of the shell", () => {
    const shell = readFileSync(join(here, "step-shell.tsx"), "utf8");
    expect(shell).not.toMatch(/<BackLink/);
  });
});
