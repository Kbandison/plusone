# Patched dependencies

One patch, and it exists because a colour on the verification screen is painted
into a `<canvas>` rather than styled.

## `@aws-amplify/ui-react-liveness@3.6.8`

**What it changes.** One line in `drawLivenessOvalInCanvas`, which fills the area
around the face oval during a liveness check. Upstream:

```js
ctx.fillStyle = isStartScreen
  ? getComputedStyle(canvas).getPropertyValue("--amplify-colors-background-primary")
  : "#fff";
```

The start screen reads the theme token. The check itself takes a hardcoded
white, so the oval sat on a white field in the middle of this app's cream —
and no token, class, stylesheet or prop can reach a canvas fill. `components`
exposes only the photosensitivity warning and the error view. There was no
supported way to change it.

The patch applies the branch AWS already wrote to both cases, keeping their
literal as the fallback:

```js
ctx.fillStyle =
  getComputedStyle(canvas).getPropertyValue("--amplify-colors-background-primary") || "#fff";
```

`apps/web/src/app/onboarding/liveness/liveness-theme.css` sets that token to
`var(--surface)`, so the fill follows Linen and Dusk like everything else.

## What you will see when Amplify is upgraded

Two different failures, both loud, neither silent. `pnpm install` stops in both
cases — nothing installs, so a bad state cannot reach a build.

**A new version, patch left behind.** The key in `pnpm-workspace.yaml` names an
exact version, so a bump orphans it:

```
ERR_PNPM_UNUSED_PATCH  The following patches were not used: @aws-amplify/ui-react-liveness@3.7.0

Either remove them from "patchedDependencies" or update them to match packages in your dependencies.
```

**Same version, patch edited or context drifted.** The lockfile records the
patch's hash:

```
ERR_PNPM_LOCKFILE_CONFIG_MISMATCH  Cannot proceed with the frozen installation.
The current "patchedDependencies" configuration doesn't match the value found in the lockfile

Update your lockfile using "pnpm install --no-frozen-lockfile"
```

## Re-cutting it

```sh
pnpm patch @aws-amplify/ui-react-liveness@<new-version>
```

In the directory it prints, edit **both** build outputs — the bundler may take
either:

- `dist/index.js`
- `dist/esm/components/FaceLivenessDetector/service/utils/liveness.mjs`

Find `fillStyle` inside `drawLivenessOvalInCanvas` and make both branches read
the token, as above. Then:

```sh
pnpm patch-commit '<the directory it printed>'
rm patches/@aws-amplify__ui-react-liveness@<old-version>.patch   # if a new file was written
pnpm install --frozen-lockfile                                    # what CI and Vercel run
pnpm --filter @plusone/web exec vitest run src/app/onboarding/liveness/liveness-ui.test.ts
```

## If upstream fixes it

Check first — this may not need patching at all any more. If
`drawLivenessOvalInCanvas` no longer contains a literal `#fff`, delete the patch
file, remove the `patchedDependencies` entry from `pnpm-workspace.yaml`, and
delete the `describe("the canvas fill is patched to follow the theme")` block
from `liveness-ui.test.ts`. Its sibling test — the one asserting three class
names still map to literal `#fff` rules — is separate and stays.

## Why this is tested rather than trusted

A patch is the one fix that can disappear without anybody touching this repo.
Two tests in `apps/web/src/app/onboarding/liveness/liveness-ui.test.ts` read the
**installed** package and fail if the hardcoded branch returns. They run in CI
against a clean `--frozen-lockfile` install, which is the only place that proves
the patch actually applies rather than that someone's `node_modules` is stale.
