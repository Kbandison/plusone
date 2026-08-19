"use client";

import { FaceLivenessDetectorCore } from "@aws-amplify/ui-react-liveness";
import "@aws-amplify/ui-react/styles.css";
// After Amplify's, deliberately. Nothing here depends on source order — every
// declaration lands on the wrapper element rather than :root — but a themed
// widget should not rely on the reader knowing that.
import "./liveness-theme.css";

import { DRAFT_COPY } from "@plusone/config";

import type { BrowserCredentials } from "@/lib/liveness-aws";

/**
 * The camera step.
 *
 * Split into its own module so `next/dynamic` can keep it out of the main
 * bundle — it pulls in the Amplify UI runtime and a video pipeline, and nobody
 * on any other screen should pay for that.
 *
 * `FaceLivenessDetectorCore`, not `FaceLivenessDetector`: the latter reaches for
 * Amplify Auth and a Cognito identity pool. Core takes a credentialProvider,
 * which is what lets this app vend its own — see vendBrowserCredentials, which
 * federates down to StartFaceLivenessSession alone.
 */
export function LivenessCapture({
  sessionId,
  region,
  credentials,
  onComplete,
  onFailed,
  onCancel,
}: {
  sessionId: string;
  region: string;
  credentials: BrowserCredentials;
  onComplete: () => void;
  onFailed: () => void;
  onCancel: () => void;
}) {
  return (
    // The whole screen, centred.
    //
    // In the step flow this sat in a 600px column under a progress bar, a
    // heading and a sign-out link, all of which compete for attention at the
    // exact moment somebody is being asked to hold their face still. It is also
    // the only step whose content is a live camera: everything else on the
    // screen is furniture around a thing that wants the screen.
    //
    // `fixed` rather than a tall section, so it is centred in the VIEWPORT
    // rather than in the document — on a phone in particular those are not the
    // same place. It scrolls if a small screen cannot hold it.
    <div className="liveness-theme fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ground p-4">
      <div className="w-full max-w-[432px] overflow-hidden rounded-xl border border-line-2">
        <FaceLivenessDetectorCore
          sessionId={sessionId}
          region={region}
          // Called once at the start of the flow with no refresh, which is why
          // these are minted for fifteen minutes rather than for seconds.
          config={{
            credentialProvider: () =>
              Promise.resolve({
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken,
                expiration: new Date(credentials.expiration),
              }),
          }}
          // Every word inside the camera, in this app's voice rather than AWS's.
          // Without this the check says "Move face in front of camera", "Rec"
          // and "Client error" in the middle of a screen about somebody's face.
          displayText={DRAFT_COPY.liveness.camera}
          // The component signals only that analysis FINISHED. It does not say
          // whether it passed, and it is not asked to: the verdict is read from
          // AWS server-side against this session id.
          onAnalysisComplete={async () => {
            onComplete();
          }}
          onError={onFailed}
          onUserCancel={onCancel}
        />
      </div>
    </div>
  );
}
