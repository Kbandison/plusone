#!/bin/sh
#
# Xcode Cloud runs this after cloning, before it resolves packages or builds.
#
# ── why this is not optional ────────────────────────────────────────────────
#
# A fresh clone of this repository CANNOT build the iOS app. Three things the
# Xcode project needs are gitignored, because `npx cap sync` generates them:
#
#   App/App/capacitor.config.json   the server URL, plugin list, iOS options
#   App/App/config.xml              Cordova compatibility shim
#   App/App/public/                 the bundled offline page (webDir)
#
# The first is in the Resources build phase, so without it the build fails
# rather than producing something wrong — which is the better failure, but it
# still fails.
#
# And the SPM package graph resolves the Capacitor plugins by LOCAL PATH into
# node_modules:
#
#   CapacitorKeyboard -> node_modules/@capacitor/keyboard @ local
#
# so `pnpm install` has to happen before Xcode looks at packages at all. That
# is why this is a POST-CLONE script and not a pre-build one: pre-build runs
# after package resolution, which would already have failed.
#
# ── why Xcode Cloud at all ──────────────────────────────────────────────────
#
# Build 5 was built with the latest public Xcode (26.6, iOS 26.5 SDK) and Apple
# refused it with ITMS-90111. Build 6 used Xcode 27 beta and App Store Connect
# refused it for being a beta. The requirement Apple publishes — Xcode 26 or
# later, iOS 26 SDK — was met by build 5, so neither message explains it.
#
# The one thing both builds shared is the machine: macOS 27 beta, recorded in
# the binary as BuildMachineOSBuild 26A5421a. Xcode Cloud builds on Apple's own
# non-beta infrastructure, which removes that variable. If a build from here is
# accepted, that was the cause. If it is refused the same way, it was not, and
# the log will say something new.

set -e

echo "--- node ---"
# Xcode Cloud images carry Homebrew but not necessarily the Node this repo
# pins. CI elsewhere pins 22 and both machines have drifted off it before, so
# it is named rather than inherited.
if ! command -v node >/dev/null 2>&1; then
  brew install node@22
  export PATH="$(brew --prefix node@22)/bin:$PATH"
fi
node --version

echo "--- pnpm, via corepack ---"
corepack enable
corepack prepare --activate

echo "--- workspace install ---"
# From the repository root, not from here: this is a pnpm workspace and the
# plugin packages the SPM graph points at live in the ROOT node_modules.
cd "$CI_PRIMARY_REPOSITORY_PATH"
pnpm install --frozen-lockfile

echo "--- cap sync, which writes the three ignored files ---"
cd apps/ios
npx cap sync ios

echo "--- what was generated ---"
ls -1 ios/App/App/capacitor.config.json ios/App/App/config.xml
# The server URL matters more than anything else here: a build pointed at a
# laptop is a build that shows an error page to a reviewer.
grep -o '"url": "[^"]*"' ios/App/App/capacitor.config.json
