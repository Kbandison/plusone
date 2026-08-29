#!/bin/sh
#
# Gives every Xcode Cloud archive its own build number.
#
# Without this, each one carries whatever CURRENT_PROJECT_VERSION is committed
# — the same number every time — and App Store Connect refuses a duplicate at
# upload. The refusal is clear enough, but it arrives after a full build, and
# the fix people reach for is bumping the committed number by hand before every
# release, which is a step that gets forgotten exactly once.
#
# CI_BUILD_NUMBER is Xcode Cloud's own counter and starts at 1. Builds 1 to 6
# were already uploaded from this machine before Xcode Cloud existed, so the
# counter alone would collide immediately. The offset puts it permanently past
# them and leaves the two sequences readable apart: anything below 100 was built
# on somebody's laptop, anything above it was built by Apple.

set -e

if [ -z "$CI_BUILD_NUMBER" ]; then
  echo "No CI_BUILD_NUMBER — not running in Xcode Cloud. Leaving the version alone."
  exit 0
fi

BUILD_NUMBER=$((CI_BUILD_NUMBER + 100))
PROJECT="$CI_PRIMARY_REPOSITORY_PATH/apps/ios/ios/App/App.xcodeproj/project.pbxproj"

echo "--- setting CURRENT_PROJECT_VERSION to $BUILD_NUMBER ---"
# Both build configurations. A sed that matched one would produce a Debug and a
# Release disagreeing about what build this is.
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = $BUILD_NUMBER;/g" "$PROJECT"

# Read back rather than trust the substitution: a sed that matches nothing exits
# 0 and changes nothing, which would ship the committed number and fail at
# upload with no sign of why.
FOUND=$(grep -c "CURRENT_PROJECT_VERSION = $BUILD_NUMBER;" "$PROJECT")
echo "configurations updated: $FOUND"
[ "$FOUND" -ge 2 ] || { echo "expected at least 2, got $FOUND"; exit 1; }
