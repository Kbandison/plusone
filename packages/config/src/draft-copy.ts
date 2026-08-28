/**
 * DRAFT COPY — written here, not taken from the spec.
 *
 * §3 and §9 finalise the copy that carries the product's promises. They do not
 * cover field labels and screen headings, and a screen cannot be built without
 * them. Rather than scatter unreviewed strings through components where they
 * would read as approved, every one of them lives here for Kevin to review in
 * one pass.
 *
 * Anything in `COPY` is spec-verbatim and must not be edited. Anything here is
 * a draft. When a string is approved it moves to `COPY` and leaves this file.
 */

import type { NotificationChannel, NotificationEvent } from "./notifications";

export const DRAFT_COPY = {
  /**
   * Shared across every onboarding step.
   *
   * `COPY.actions.continueLabel` is spec-verbatim and there was no counterpart:
   * every screen offered a way forward and none offered a way back, so a
   * mistyped name on step 3 was only fixable by finishing onboarding and
   * finding Settings.
   */
  steps: {
    backLabel: "Back",
    /** Named, because "Back" alone tells a screen reader nothing about where. */
    backTo: (heading: string) => `Back to ${heading.toLowerCase()}`,
  },

  /**
   * The home page's way in.
   *
   * §3.4 gives the hero and the sub but no call to action, and §7.1's marketing
   * site is Milestone 8. These three strings are the minimum that makes the
   * product reachable at all — until they existed, every screen was reachable
   * only by typing a URL.
   */
  home: {
    getStarted: "Get started",
    /**
     * Added with /sign-in. The front door had one link, and the comment above
     * it reasoned that one was enough because `/onboarding/phone` forwards a
     * signed-in member to /app. That is true of a member with a live SESSION —
     * and not of one whose session lapsed, who was sent to step one of signing
     * up and charged a text to get back into an account they already had.
     */
    signIn: "Sign in",
    // No privacy link here: SiteFooter carries one on every marketing page,
    // and a second name for the same destination is a second thing to keep
    // true. The consent screen uses COPY.consent.policyLinkLabel, which is
    // spec copy and says what that particular link is for.
  },

  phone: {
    heading: "Your number",
    intro:
      "We text you a code to sign in. Your number is never shown to anyone, and it is not used to find you.",
    phoneLabel: "Mobile number",
    /**
     * Reads as an instruction when the field is empty and as a check when a
     * country code has been suggested from the request's IP — which is wrong
     * often enough (VPNs, travel, a member on a work network) that asking them
     * to look is the honest version.
     */
    phoneHint: "Include your country code — check the one we filled in is right.",
    /**
     * The SMS opt-in disclosure. Legally required, not a formality.
     *
     * Written for A2P campaign review, and still required now that we send
     * through Twilio Verify and skip that registration: the TCPA and the CTIA
     * guidelines want express consent at the moment it is given, which is why
     * this sits under the number field rather than in the terms. It says codes
     * only, because that is true and because it is the thing a person agrees to.
     */
    smsConsent:
      "By continuing you agree to receive a one-time sign-in code by text. Codes only — we never text anything else. Message and data rates may apply.",
    smsConsentPrivacy: "Privacy",
    smsConsentTerms: "Terms",
    sendLabel: "Send code",
    codeHeading: "Enter the code",
    codeIntro: "We sent a six-digit code. It is good for ten minutes.",
    codeLabel: "Code",
    verifyLabel: "Verify",
    resendLabel: "Send it again",
    /**
     * The cooldown between resends.
     *
     * Every press is a paid message, and a member waiting on a slow SMS will
     * press it — so the wait is shown rather than the button silently doing
     * nothing. Supabase enforces its own limit server-side; this is the half
     * that costs nothing to hit.
     */
    resendWait: (seconds: number) => `Send it again in ${seconds}s`,
    changeNumberLabel: "Use a different number",
    errors: {
      phoneRequired: "Enter your mobile number.",
      phoneInvalid: "That does not look like a mobile number. Include the country code, like +1.",
      codeRequired: "Enter the code we sent.",
      codeInvalid: "That code is not right, or it has expired.",
      sendFailed: "We could not send a code just now. Try again in a moment.",
      /** Too many sends — the provider's own limit, not ours. */
      rateLimited: "That is a lot of codes. Wait a few minutes and try again.",
      /**
       * The provider refused the number itself. Usually a typo or a missing
       * country code, and no amount of retrying fixes either.
       */
      undeliverable:
        "We could not send a code to that number. Check it is right, including the country code.",
      notConfigured:
        "Phone sign-in is not switched on yet. This is a setup step on our side, not something you did.",
    },
  },

  /**
   * Coming back (as opposed to `phone`, which is arriving).
   *
   * Decision #21 makes the phone how an account is MADE. It does not make SMS
   * the only way back into one, and treating it that way charged a message for
   * every returning member on every new device — and left anyone whose number
   * changed with no route to their own photos and chats.
   *
   * One field takes either credential. A member returning after months does not
   * remember which they used, and a phone/email toggle makes them guess before
   * there is any reason to make them.
   */
  signIn: {
    heading: "Welcome back",
    intro: "Enter your number or your email and we will send you a code.",
    identifierLabel: "Mobile number or email",
    identifierHint: "Whichever you have on your account. Numbers need a country code, like +1.",
    sendLabel: "Send code",
    codeHeading: "Enter the code",
    codeIntro: "We sent a six-digit code. It is good for ten minutes.",
    codeLabel: "Code",
    verifyLabel: "Sign in",
    resendLabel: "Send it again",
    resendWait: (seconds: number) => `Send it again in ${seconds}s`,
    changeLabel: "Use something else",
    /**
     * Shown when someone arrives from a link that no longer works — the common
     * ending for an emailed link, since they expire and are single-use. Says
     * what to do rather than what went wrong, because there is nothing the
     * member did and nothing for them to fix.
     */
    linkExpired: "That link has expired. Enter your number or email for a fresh code.",
    newHere: "New here?",
    newHereLink: "Start with your number",
    /**
     * Shown under the field because this screen can still send an SMS, and the
     * Consent belongs at the moment the message is sent rather than in a
     * document. Shorter than the onboarding one: a returning member agreed to
     * this when they joined, so this is a reminder rather than an opt-in.
     */
    smsConsent:
      "If you use your number, we text you a one-time code. Codes only. Message and data rates may apply.",
    errors: {
      identifierRequired: "Enter your mobile number or your email.",
      /**
       * ONE message for both malformed shapes, on purpose. Saying "that is not
       * a valid email" to something with an @ in it and "that is not a valid
       * number" to something without confirms which field a stranger is
       * probing.
       */
      identifierInvalid:
        "That does not look like a mobile number or an email address. Numbers need a country code, like +1.",
      codeRequired: "Enter the code we sent.",
      codeInvalid: "That code is not right, or it has expired.",
      sendFailed: "We could not send a code just now. Try again in a moment.",
      rateLimited: "That is a lot of codes. Wait a few minutes and try again.",
      /**
       * The provider refused the number. Covers both an unroutable number —
       * the common case, which no amount of retrying fixes — and a genuine
       * outage, because the error code cannot tell the two apart and the
       * provider's own wording is not ours to show.
       */
      undeliverable:
        "We could not send a code to that number. Check it is right, including the country code.",
      notConfigured:
        "Sign-in is not switched on yet. This is a setup step on our side, not something you did.",
    },
  },

  basics: {
    heading: "The basics",
    intro:
      "Your name is what other members see. It does not have to be the one on your ID — most people here use a first name only.",
    displayNameLabel: "Display name",
    displayNameHint: "Up to 40 characters.",
    birthdateLabel: "Date of birth",
    birthdateHint: "Members see your age, never your date of birth.",
    errors: {
      nameRequired: "Choose a display name.",
      nameTooLong: "That is longer than 40 characters.",
      birthdateRequired: "Enter your date of birth.",
      birthdateInvalid: "That date does not look right.",
      tooYoung: "You have to be 18 or over to use Plus One.",
    },
  },

  community: {
    heading: "Your community",
    intro:
      "This decides who you see and who sees you. You can change it later, and you can opt in to seeing the other community from Settings.",
    communityLabel: "Community",
    conditionLabel: "What you are living with",
    uEqualsULabel: "Show the U=U badge on my profile",
    uEqualsUHint: "Undetectable equals untransmittable. Only you decide whether this appears.",
    errors: {
      communityRequired: "Choose a community.",
      conditionRequired: "Choose one.",
      mismatch: "That combination is not one of the options.",
    },
  },

  quiz: {
    heading: "A few questions",
    intro:
      "Twelve quick ones. They shape who you see, and there are no right answers — only ways of being. You can skip this and it will not count against you.",
    skipLabel: "Skip for now",
    skipNudge: "Answering even a few makes your Drop better.",
    /**
     * No finishLabel any more. It said "Done", which was wrong twice over: the
     * quiz is step 8 of 10, so it finishes nothing, and next to a Back button
     * it read as a way out of onboarding rather than a way through it.
     *
     * The right word is the one every other step already uses, and that word is
     * approved copy — so the quiz uses COPY.actions.continueLabel rather than
     * keeping a draft that happens to spell it the same. A draft identical to a
     * spec string is a second place for it to drift.
     */
    progress: (answered: number, total: number) => `${answered} of ${total}`,
  },

  liveness: {
    heading: "A quick selfie",
    /**
     * Reworded when the AWS adapter landed. It used to say the picture "is
     * deleted the moment the check finishes", which was written when we
     * expected to receive one. We do not: the video streams from the device
     * straight to the checking service, no image is requested back, and none is
     * ever stored here. "Deleted" implied we held it, which understated this.
     */
    intro:
      "Every profile here is a verified human. Point your camera at your face for a few seconds and the check runs automatically. The video goes straight to the service that checks it — it never reaches us, and it is never shown to anyone.",
    startLabel: "Take the selfie",
    /**
     * onUserCancel — backing out is not a failed attempt and must not read as
     * one. There is no matching label here on purpose: the cancel control
     * belongs to the camera component and carries its own text.
     */
    cancelledBody: "No problem. You can start the check whenever you are ready.",
    checkingLabel: "Checking…",
    retryLabel: "Try again",
    retriesLeft: (n: number) =>
      `${n} ${n === 1 ? "attempt" : "attempts"} left before a person takes a look.`,
    flaggedHeading: "We will take a look",
    /**
     * The REJECTED screen, which did not exist.
     *
     * A member an administrator had already refused was shown flaggedBody: "The
     * automatic check could not decide. Someone on our team will review it,
     * usually within a day. You do not need to do anything." For them every
     * clause was false — the check decided, the review happened, and doing
     * nothing changed nothing — and the resolver returned them to that screen on
     * every visit, forever.
     */
    rejectedHeading: "That review has finished",
    rejectedBody:
      "Someone on our team looked and could not confirm the selfie matched a live person. If you think that is wrong, ask us to look again and a different person will.",
    appealLabel: "Ask us to look again",
    appealPendingHeading: "We are looking again",
    appealPendingBody:
      "Your request is with our team. You do not need to do anything, and we will not ask you for another selfie while it is open.",
    appealErrors: {
      notUnderReview: "There is no review to appeal right now.",
      alreadyOpen: "You already have a request open. We will get to it.",
      failed: "We could not send that just now. Try again in a moment.",
    },
    flaggedBody:
      "The automatic check could not decide. Someone on our team will review it, usually within a day. You do not need to do anything.",
    errors: {
      failed: "That did not pass. Make sure your face is well lit and fills the frame.",
      /**
       * The camera never opened — no device, or permission refused. Distinct
       * from `failed` on purpose: nothing was checked, so telling someone their
       * face did not pass is both wrong and discouraging. On a desktop without
       * a webcam this is the only message anyone will ever see.
       */
      camera:
        "We could not reach your camera. Check that this site is allowed to use it, then try again.",
      unavailable: "The check is unavailable right now. Try again in a moment.",
      /**
       * Distinct from `unavailable`. Collapsing every failure into one message
       * is how a missing phone_verified transition looked like a provider
       * outage for the whole of this build.
       */
      phoneFirst: "Your number needs verifying first. Go back a step and we will send you a code.",
    },

    /**
     * Every word inside the camera itself.
     *
     * The check is an AWS component, and until this existed it spoke AWS's
     * English in the middle of this app: "Move face in front of camera", "Rec",
     * "Client error", "Check failed due to client issue". Fifty-odd strings, on
     * the one screen where a member is being asked to point a camera at their
     * own face for a product about a stigmatised condition — the screen where
     * sounding like a stranger's software costs the most.
     *
     * The component takes every one of them as `displayText`, so none of it had
     * to stay. Same meanings, this app's voice.
     *
     * Two rules held while rewriting them. The hints are read aloud by screen
     * readers as they change, so they stay short and say what to DO rather than
     * what is wrong. And nothing here names a condition, a diagnosis or a
     * reason anybody is signing up — this is a camera screen and it knows
     * nothing about who is in front of it.
     */
    camera: {
      /* Live hints, swapped as the check runs. Short: they are announced. */
      hintMoveFaceFrontOfCameraText: "Bring your face in front of the camera",
      hintTooManyFacesText: "Just one face, please",
      hintFaceDetectedText: "Got you",
      hintCanNotIdentifyText: "Bring your face in front of the camera",
      hintTooCloseText: "Move back a little",
      hintTooFarText: "Move a little closer",
      hintConnectingText: "Connecting…",
      hintVerifyingText: "Checking…",
      hintCheckCompleteText: "All done",
      hintIlluminationTooBrightText: "A bit bright — try somewhere softer",
      hintIlluminationTooDarkText: "A bit dark — try somewhere brighter",
      hintIlluminationNormalText: "Lighting looks good",
      hintHoldFaceForFreshnessText: "Hold still",
      hintCenterFaceText: "Centre your face",
      /**
       * The long one, and the only one nobody sees: it is read to screen reader
       * users before the check begins, in place of watching the oval. So it
       * describes the whole shape of what is about to happen, in order.
       */
      hintCenterFaceInstructionText:
        "Before you start: put your camera at the top centre of your screen and centre your face in it. When the check begins an oval appears in the middle. You will be asked to move forward until your face fills it, then to hold still for a few seconds. You will hear when it is complete.",
      hintFaceOffCenterText: "Move your face into the oval",
      hintMatchIndicatorText: "Halfway there. Keep moving closer.",

      /* The camera itself will not open. */
      cameraMinSpecificationsHeadingText: "This camera will not manage the check",
      cameraMinSpecificationsMessageText:
        "The check needs a camera that can do at least 320 by 240, at fifteen frames a second.",
      cameraNotFoundHeadingText: "We cannot reach your camera",
      cameraNotFoundMessageText:
        "Check that this site is allowed to use your camera and that nothing else has it open. You may need to change it in your settings and reopen your browser.",
      retryCameraPermissionsText: "Try again",
      waitingCameraPermissionText: "Waiting for you to allow the camera.",
      a11yVideoLabelText: "Camera view for the check",

      /* The get-ready screen AWS recommends, which is where most people decide
         whether this feels safe. */
      goodFitCaptionText: "Good fit",
      goodFitAltText: "A face filling an oval outline.",
      tooFarCaptionText: "Too far",
      tooFarAltText: "A face inside an oval outline, with a gap all the way around it.",
      startScreenBeginCheckText: "Start the check",

      /**
       * Kept prominent and kept plain. The check really does flash colours at
       * the member, and §9 does not get to be the only place this is said.
       */
      photosensitivityWarningHeadingText: "This check flashes colours",
      photosensitivityWarningBodyText:
        "The screen flashes different colours while the check runs. Take care if you are sensitive to flashing light.",
      photosensitivityWarningInfoText:
        "Some people can have epileptic seizures when they see flashing coloured light. Take care if you, or anyone in your family, has an epileptic condition.",
      photosensitivityWarningLabelText: "More about the flashing colours",

      /* While recording. */
      recordingIndicatorText: "Rec",
      cancelLivenessCheckText: "Cancel the check",

      /**
       * Errors. AWS's originals said "Client error" and "Check failed due to
       * client issue" — true, and no help to somebody who now cannot get into
       * the app. Each of these says what happened and what to do about it.
       */
      errorLabelText: "That did not finish",
      connectionTimeoutHeaderText: "The connection dropped",
      connectionTimeoutMessageText: "We lost the connection before the check finished.",
      timeoutHeaderText: "That took too long",
      timeoutMessageText:
        "Your face did not fill the oval in time. Try again, and move close enough to fill it completely.",
      faceDistanceHeaderText: "You moved in too early",
      faceDistanceMessageText: "Hold still while it connects, then move closer when it asks.",
      multipleFacesHeaderText: "More than one face",
      multipleFacesMessageText:
        "Make sure only your face is in front of the camera when the check starts.",
      clientHeaderText: "The check stopped",
      clientMessageText: "Something on this device stopped the check before it finished.",
      serverHeaderText: "The check is having trouble",
      serverMessageText: "We could not finish the check just now.",
      landscapeHeaderText: "Turn your phone upright",
      landscapeMessageText: "Rotate your device so it is upright, then start again.",
      portraitMessageText: "Keep your device upright until the check finishes.",
      tryAgainText: "Try again",
    },
  },

  intention: {
    heading: "What you are here for",
    intro: "This shapes who you see. Be honest — everyone here is.",
    errors: { required: "Choose one." },
  },

  /**
   * The step that decides who anybody ever sees.
   *
   * Until this existed the Drop had no idea what gender anyone was or who they
   * wanted to meet — `gender` and `seeking` were columns nothing read or wrote,
   * so every member was shown to every member inside their radius.
   *
   * The order is deliberate: who you are, then who you would like to meet, then
   * the parts that only colour a profile. The two that actually filter come
   * first, so a member who abandons halfway has still answered the ones that
   * make their Drop mean something.
   */
  preferences: {
    heading: "Who you would like to meet",
    intro:
      "This shapes who turns up in your Drop, and who you turn up in. Only the first two questions decide that — the rest just help people know you.",

    genderLabel: "You are",
    seekingLabel: "You would like to meet",
    /** Empty means everyone, and a member choosing nothing should know that. */
    seekingHint: "Choose as many as you like. Leaving it empty means everyone.",

    ageLabel: "Ages you are open to",
    ageHint: "Both of you have to be in each other's range.",
    ageFrom: "Youngest",
    ageTo: "Oldest",
    /** One control with two ends, so it reads as a span rather than two numbers. */
    ageSpan: (from: number, to: number) => `${from} to ${to}`,
    /** Each thumb announces which end it is; "18" alone says nothing useful. */
    ageFromValue: (age: number) => `Youngest ${age}`,
    ageToValue: (age: number) => `Oldest ${age}`,

    /**
     * Named "about you" rather than "preferences": these are answers about the
     * member, not filters on anybody else. Saying so matters, because a member
     * who reads them as filters will answer strategically rather than honestly.
     */
    aboutHeading: "A bit more about you",
    aboutHint: "None of these filter your Drop. They sit on your profile so people know you.",
    smokesLabel: "Smoke",
    drinksLabel: "Drink",
    kidsLabel: "Kids",
    kidsPlanLabel: "Feelings about kids",

    skipLabel: "Prefer not to say",
    /** The same questions on the profile, where they are changed rather than set. */
    editHeading: "Who you would like to meet",
    editSaveLabel: "Save",
    editSaved: "Saved.",
    errors: {
      genderRequired: "Choose one, so people looking for you can find you.",
      ageOrder: "The first age has to be lower than the second.",
      ageRange: "Ages have to be between 18 and 120.",
      failed: "That did not save. Try again.",
    },
  },

  photos: {
    heading: "Your photos",
    intro: "At least one photo, and you choose who gets to see it clearly.",
    /** Plural since the picker takes several at once. */
    addLabel: "Add photos",
    /**
     * Picking files used to start an upload with no button press and no
     * announcement. With several at once there is more silence to fill, so this
     * says which one is going up rather than only that something is.
     */
    uploading: (done: number, total: number) =>
      total === 1 ? "Uploading…" : `Uploading ${done} of ${total}…`,
    /** The photos themselves, which the step never showed — only counted. */
    yoursHeading: "Your photos so far",
    /**
     * position 0 is not a label, it is the photo every card, drop and profile
     * shows. Saying which one that is was the missing half of letting anybody
     * change it.
     */
    mainBadge: "Main",
    /** The instruction that replaced the buttons. */
    orderHint: "Drag your photos to reorder them. The first one is what people see first.",
    /**
     * Dragging is unusable by keyboard, so the same move has to exist there.
     * Announced on each photo rather than written on screen, because a member
     * using a mouse has already been told what to do by the line above.
     */
    dragNamed: (position: number, total: number) =>
      `Photo ${position} of ${total}. Press the left or right arrow keys to move it.`,
    /** Named, because a page of identical Remove buttons is unusable by ear. */
    removeNamed: (position: number) => `Remove photo ${position}`,
    /** Six is the ceiling; this is what is left of it. */
    roomLeft: (n: number) => (n === 0 ? "That is the most you can add." : `You can add ${n} more.`),
    privacyLabel: "Who sees your photos",
    clearLabel: "Everyone who can see my profile",
    blurredLabel: "Blurred until we connect",
    blurredHint:
      "People see that you have photos, and see them properly once you have both said yes.",
    errors: {
      required: "Add at least one photo.",
      tooLarge: "That image is larger than 8 MB.",
      /** Shown only when the browser could not shrink it and it is still too big. */
      tooLargeToShrink:
        "That image is too large to send, and this browser could not shrink it. Try a JPEG or a smaller version.",
      preparing: "Getting your photo ready…",
      wrongType: "Photos have to be JPEG, PNG, WebP or HEIC.",
      uploadFailed: "That did not upload. Try again.",
      /**
       * Reached by picking more files than there is room for, which is easy now
       * that the picker takes several. Says the limit rather than "that did not
       * upload", which is what the database constraint alone would have
       * produced — and which would have been advice that could never work.
       */
      full: (max: number) => `You can have up to ${max} photos.`,
      /**
       * Picking MORE than there is room for now cancels the whole batch rather
       * than uploading the ones that fit. Half a selection arriving is worse
       * than none: the member cannot tell which of their photos made it, and
       * the ones that did are not the ones they would have chosen.
       */
      tooMany: (picked: number, room: number) =>
        `You picked ${picked} and there is room for ${room}. Nothing was uploaded — choose again.`,
    },
  },

  radius: {
    heading: "How far you will go",
    intro:
      "We look for people within this distance first. If there are not many nearby, we widen the search for that night and tell you we did.",
    label: "Search radius",
    /**
     * The location ask, on the step that is ABOUT distance. §7.2's first screen
     * was the wrong place for it — "asking somebody to share their location on
     * the first screen of an app about a stigmatised condition is the wrong
     * trade for saving them three keystrokes" — but a radius with nothing to
     * measure from is not a setting, it is a number.
     */
    locationHint:
      "We ask your device where you are so we can measure this. Your exact position is never stored — it is rounded to about a kilometre before it is saved, and nobody is ever shown your coordinates.",
    locationDenied:
      "No problem. We will work from your approximate area instead, which is less precise.",
    /**
     * Both the prompt and the fallback came back with nothing. Said plainly,
     * because the alternative is a member finishing onboarding into an empty
     * app with no idea why — which is what a country centroid stored as a
     * location produces, and it looks identical to nobody being nearby.
     */
    locationUnknown:
      "We could not work out where you are, so we cannot show you anyone nearby yet. Allow location access and finish this step again, and everything else will work.",
    unit: (mi: number) => `${mi} miles`,
    continueLabel: "Finish",
  },

  app: {
    /**
     * Decision #19 puts a compatibility percentage on the card. Said as a
     * MATCH rather than a score: "82% compatible" claims a measurement of two
     * people, which nothing here can honestly make — it is intention and a
     * twelve-question quiz, and it should read as a hint rather than a verdict.
     */
    compatibilityLabel: (percent: number) => `${percent}% match`,
    /** What the number is, for anybody who wonders what it measured. */
    compatibilityNote: "Based on what you are each looking for and your answers to the questions.",
    /** §6.1 step 2 — how many people the pool was drawn from (Decision #19). */
    previewDensity: (count: number, radiusMi: number) =>
      count === 1
        ? `1 person within ${radiusMi} miles tonight.`
        : `${count} people within ${radiusMi} miles tonight.`,
    previewHowHeading: "How this works",
    previewHow: [
      "Three profiles arrive at 8pm, chosen for you rather than scrolled through.",
      "Nobody can message you first. A connect is a reply to one of your prompts.",
      "Every chat has a seven-day fuse, so no conversation is left hanging.",
    ],
    dropEmptyHeading: "Nothing tonight",
    navHome: "Tonight",
    navBrowse: "Browse",
    navInbox: "Inbox",
    navChats: "Chats",
    navRooms: "Rooms",
    navProfile: "Profile",
    connectLabel: "Connect",
    /**
     * One section, because a connect and the chat it becomes are the same
     * thread. Accepting used to make a row vanish from Inbox and reappear under
     * Chats with nothing on screen joining the two — the strongest argument
     * against the split was never tidiness, it was that the transition was
     * invisible.
     *
     * Decision #14 calls the whole pipeline the "Inbox model", so the section
     * keeps that name rather than inventing one.
     */
    /**
     * One list, no sections.
     *
     * "Sent" was its own heading, which made a thread you started look like a
     * different kind of object from one somebody sent you. It is the same
     * thread at a different stage, and what a member wants to know is which of
     * them is theirs to do — so the state is on the row rather than in the
     * heading above it.
     */
    threadNeedsDecision: "Waiting on you",
    /**
     * Three sections, because one flat list made a live conversation and an
     * unanswered ask render as the same object — told apart by a three-word
     * state label most people never read.
     *
     * The sent section reuses threadSentWaiting above rather than owning a
     * second word for the same fact. "Sent" described how the row got there;
     * "Waiting on them" describes what it is doing, which is what the row
     * itself already says.
     */
    inboxChatsHeading: "Conversations",
    inboxClosedHeading: "Closed",
    /**
     * The same fact, said on a Browse card.
     *
     * Browse listed everyone in range with no memory, so somebody you were
     * mid-conversation with looked exactly like a stranger. The two pending
     * states reuse the thread wording above — it is the same fact about the
     * same connect, and two spellings of it would be two things to keep true.
     *
     * "Connected before" covers a decline without naming one. See historyWith.
     */
    browseTalking: "You're talking",
    browsePast: "Connected before",
    threadSentWaiting: "Waiting on them",
    threadNeedsReply: "Your turn",
    threadTheirTurn: "Their turn",
    threadNoMessages: "Say something",
    threadSettled: "Closed",
    /** The dot, for a screen reader that cannot see it. */
    threadUnread: "New",
    /** A voice note has no body; an empty line reads as a message that failed. */
    threadVoiceNote: "Voice note",
    /**
     * Somebody whose name the viewer may not have — blocked since, or no longer
     * on a dating surface. The row still exists because the thread does.
     */
    threadUnknownPerson: "Someone",
    /** A chat's fuse and a connect's expiry, said the same short way. */
    threadTimeLeft: (days: number) => (days <= 1 ? "1 day left" : `${days} days left`),
    threadExpired: "Expired",
    /** Both halves empty. Two separate empty states read as two broken screens. */
    inboxAllEmpty: "Nothing waiting. Your Drop arrives at 8pm.",
    /**
     * The page, not the section inside it.
     *
     * This said "Waiting on you" from when the screen held pending connects and
     * nothing else. Once chats folded in and the queue got its own heading, the
     * same three words appeared twice on one screen — the h1 naming the page
     * and the h2 naming a section of it.
     */
    inboxHeading: "Inbox",
    acceptLabel: "Accept",
    declineLabel: "Decline",
    /**
     * Decision #14 — no interaction ends in silence, so declining still sends a
     * note. Saying so BEFORE the button is pressed is what stops Decline
     * reading as "ignore", which is the thing this product exists not to be.
     */
    declineNote: "Declining sends a short, kind note. Nobody is left wondering.",
    /**
     * The close control's name, not a visible label — it is an X in the corner.
     * Escape and a click outside close it too, but neither announces itself,
     * and neither of the two buttons below is safe to press by accident.
     */
    decisionDismiss: "Close",
    chatsHeading: "Chats",
    /**
     * The two message lists were the only ones in the app with no empty state,
     * and an empty chat is guaranteed at creation — so the first thing both
     * people saw after matching was a blank rectangle.
     */
    /**
     * The chat opened on "Say the first thing" even though something had
     * already been said: the prompt and the reply are what a connect IS
     * (Decision #14), and accepting one threw them away at the moment they
     * stopped being a decision and became a conversation.
     */
    chatOriginNote: "This is where it started.",
    chatEmptyHeading: "Say the first thing",
    chatEmptyBody:
      "Nobody has written yet. There is no clever opener needed here — the hard part is already behind both of you.",
    /**
     * The dot on a room tab, for a reader that cannot see it.
     *
     * Deliberately not a count. A number invites a member to clear it, and a
     * support room is not an inbox to get to zero — Decision #26 rules out
     * mechanics that make people feel behind.
     */
    roomUnread: "New posts",
    /**
     * One of these sits on every post in a room, so a screen reader hears the
     * label once per row. "More" repeated forty times says nothing; this at
     * least says what it is more OF.
     */
    postMenuLabel: "Post options",
    /** The reaction. No counterpart — see Decision #26 and the 000800 migration. */
    postLikeLabel: "Like",
    postUnlikeLabel: "Remove like",
    postLikeCount: (n: number) => `${n} ${n === 1 ? "like" : "likes"}`,
    postCommentCount: (n: number) => (n === 1 ? "1 comment" : `${n} comments`),
    postCommentNone: "No comments yet",
    postImageLabel: "Add a photo",
    /** The box on the room page, which is a way in rather than a field. */
    roomComposeOpen: "Share something with the room",
    roomComposeHeading: "New post",
    postImageRemove: "Remove photo",
    /**
     * Three reasons, three messages.
     *
     * One string for all of them told a member nothing and told us less: the
     * first time an upload failed there was no way to know which branch had
     * refused it, and the answer had to be guessed at from the outside.
     */
    imageTooBig: "That file is too large. Photos need to be under 8 MB.",
    imageWrongType: "That file is not an image we can use. JPEG, PNG or WebP.",
    imageUnreadable: "That image could not be read. Try a different one.",
    imageUploadFailed: "The photo did not upload. Try again in a moment.",
    /** Decorative to a reader by default: only the poster knows what is in it. */
    postImageAlt: "Photo in this post",
    /**
     * The same picture, in a chat rather than a room.
     *
     * Its own string because the alternative reads wrong in both places: a
     * photograph sent to one person is not "in this post", and a screen reader
     * announcing it as one is describing the wrong surface. Claude's words,
     * both of them.
     */
    chatImageAlt: "Photo in this message",
    chatImageOpen: "Open this photo",
    /** The whole row is one target; this is what a reader hears it as. */
    postOpenThread: (name: string) => `Open ${name}'s post`,
    postImageOpen: "View photo full screen",
    /** Latest news has no composer — nobody posts an article — so the box searches. */
    roomSearchPlaceholder: "Search this room",
    roomSearchClear: "Clear search",
    roomSearchEmpty: (term: string) => `Nothing here matches "${term}".`,
    /** Sharing: out of the app, or into another room. */
    postShareLabel: "Share",
    postShareCopy: "Copy link",
    postShareCopied: "Link copied",
    postShareExternal: "Share…",
    postShareToRoom: "Post to another room",
    /** Above a shared post, because somebody chose to bring it. */
    postSharedBy: (name: string) => `${name} shared this`,
    /**
     * Collapsed by default. A comment with nine replies under it pushes the
     * next comment off the screen, and the member scrolling past has not
     * decided to read that sub-conversation yet.
     */
    postShowReplies: (n: number) => (n === 1 ? "1 reply" : `${n} replies`),
    postHideReplies: "Hide replies",
    /** Author-only, so it is addressed to them: "your post", not "this post". */
    postViewCount: (n: number) => `Seen by ${n} ${n === 1 ? "person" : "people"}`,
    postReplyPlaceholder: "Write a comment",
    postReplyLabel: "Comment",
    /** On a comment. It answers that person, in the same one level of replies. */
    postReplyToLabel: "Reply",
    postReplyingTo: (name: string) => `Replying to ${name}`,
    postReplyCancel: "Cancel reply",
    postThreadHeading: "Post",
    postBackToRoom: "Back to the room",
    /**
     * Said plainly beside a pseudonym. A made-up name that does not announce
     * itself is a name a reader will take for a real one — and the person who
     * chose it is relying on nobody making that mistake.
     */
    postAnonymous: "anonymous",
    /**
     * The composer's choice, per post rather than per member. The default is
     * named: somebody who has decided to be anonymous will say so, and a
     * default that hides everyone makes a room of strangers.
     */
    postAnonymousLabel: "Post anonymously",
    postAnonymousNote:
      "Your name and photo stay off this post. You keep the same made-up name in this room, and a different one in every other.",
    roomEmptyHeading: "Nothing here yet",
    roomEmptyBody: "No posts in this room so far. Yours can be the first.",
    fuseDaysLeft: (days: number) => `${days} ${days === 1 ? "day" : "days"} left`,
    fuseExpiringSoon: "Closes tomorrow",
    datePlannedLabel: "Date planned",
    /**
     * The chat closed while they were typing.
     *
     * Distinct from a failed send, because it is not one: the RLS with-check
     * refused the insert because the fuse ran out or the other member closed it.
     * "That didn't send." left people retrying into a surface that would never
     * accept anything again.
     */
    chatClosedMidSend: "This chat closed while you were writing. There is a note waiting for you.",
    /** An empty room post used to return success and do nothing at all. */
    emptyPost: "Write something first.",
    /**
     * Announced when the recorder changes phase. Each phase renders a different
     * button, so pressing one destroys the element holding focus — without this
     * a screen-reader user got silence and a lost cursor.
     */
    voiceRecordingStatus: "Recording.",
    voiceReviewStatus: "Recorded. Listen back before you send it.",
    messagePlaceholder: "Say something",
    sendLabel: "Send",
    proposeHeading: "Propose a plan",
    planDateLabel: "Day",
    planTimeLabel: "Rough time",
    planPlaceLabel: "Place, or video",
    proposeLabel: "Propose",
    confirmPlanLabel: "Confirm this plan",
    cancelPlanLabel: "Cancel the plan",
    /** §6.2 — cancelling re-arms the fuse at 72 hours rather than closing the chat. */
    cancelPlanConfirm: "Cancel this plan? The chat stays open and the timer restarts at 72 hours.",
    cancelPlanConfirmLabel: "Yes, cancel it",
    cancelPlanKeepLabel: "Keep the plan",
    awaitingConfirmation: "Waiting for them to confirm.",
    closeHeading: "Close this chat",
    closeTemplateLabel: "Choose a note",
    closePersonalLineLabel: "Anything else (optional)",
    closeLabel: "Close and send the note",
    closedNoteHeading: "A note was left",
    /** The header menu holding close, report and block. */
    chatMenuLabel: "More",
    /** The date proposal, collapsed until asked for. */
    proposeToggleLabel: "Propose a date",
    voiceRecordLabel: "Record a voice note",
    voiceStopLabel: "Stop",
    voiceSendLabel: "Send voice note",
    voiceDiscardLabel: "Discard",
    voiceRecording: (seconds: number) => `${seconds}s`,
    voiceTooLong: "Voice notes cap at two minutes.",
    voiceUnsupported: "Your browser will not let this page use the microphone.",
    voiceFailed: "That didn't send.",
    /** A bare <audio controls> announces "audio player" and nothing else. */
    voiceNoteAria: (seconds: number | null) =>
      seconds ? `Voice note, ${seconds} seconds` : "Voice note",
    browseEmpty: "Nobody matches those filters right now.",
    /**
     * What to do about it, on the screen that caused it.
     *
     * "Nobody matches those filters" with the filters sitting right above it
     * and no way to undo them in one press is a dead end describing itself.
     * Claude's words, both.
     */
    browseClearFilters: "Clear filters",
    /**
     * Decision #15, said out loud.
     *
     * "Drop-card connects cost nothing — this nudges toward curation" has been
     * true in the trigger since Milestone 1 and stated nowhere a member could
     * read it. A mechanic that only works if people know about it, that nobody
     * was told about, is a mechanic that does not work. All three are Claude's.
     */
    dropConnectsFree: "Replying to one of tonight's three costs nothing.",
    dropBudgetLeft: (left: number, total: number) =>
      `${left} of ${total} connects left today for anyone else.`,
    dropBudgetNone: "You have used today's connects. Tonight's three are still free.",
    /**
     * When the next three land, which the app could not honestly say before.
     *
     * DROP.hourLocal declared 20:00 from Milestone 1 and nothing read it — a
     * drop was keyed on the local calendar date, so it arrived whenever a
     * member first opened the app that day. Saying "at 8pm" would have been a
     * claim about a schedule nothing kept. Now a night runs from the hour, and
     * these are true. Claude's words.
     */
    dropNextTonight: (time: string) => `Tonight's three land at ${time}.`,
    dropNextTomorrow: (time: string) => `Three more tomorrow at ${time}.`,
    browseCount: (n: number) => (n === 1 ? "1 person" : `${n} people`),
    filterDistance: "Within",
    filterIntention: "Looking for",
    filterActive: "Active this week only",
    filterAny: "Any",
    applyFiltersLabel: "Apply",
    /**
     * The page asks for sixty rows and said nothing when it got sixty.
     *
     * A member in a dense city saw a grid that ended and had no way to know
     * whether that was everybody or the first screen of them. Both Claude's
     * words.
     */
    browseTruncated: (n: number) => `Showing the ${n} most recently active.`,
    /**
     * The list is ordered by it, and nothing on a card said so — the sort was
     * invisible, which makes it read as arbitrary.
     *
     * Coarse on purpose. "Active 3h ago" on a dating surface is a precision
     * nobody asked to broadcast, and the app already has this exact bucket in
     * the filter beside it.
     */
    browseActiveThisWeek: "Active this week",
    roomsHeading: "Rooms",
    roomsEmpty: "No rooms yet.",
    roomJoinLabel: "Join",
    roomPostPlaceholder: "Say something to the room",
    roomPostLabel: "Post",
    /**
     * Invite and Premium moved off the bottom bar and into here.
     *
     * §7.4 lists six sections — Home, Browse, Inbox, Chats, Rooms, Profile &
     * Settings — and puts "referral screen w/ share sheet + counter" and
     * "subscription mgmt via Stripe portal" INSIDE the last one. They had been
     * promoted to top-level, which made nine items on a bar sized for a phone
     * and gave the two things a member touches least the same weight as the
     * Drop.
     */
    inviteSettingsHeading: "Invite someone",
    inviteSettingsBody:
      "Every person who joins and gets verified adds free premium time to your account, and to theirs.",
    inviteSettingsLink: "Open invites",
    settingsHeading: "Settings",
    /**
     * The other settings tab.
     *
     * Premium had a card in Settings — a heading, a sentence and a link — whose
     * only job was to point at a page. The card's three strings went with it
     * when the page became a tab; this one is the tab beside it. Claude's word.
     */
    settingsGeneral: "General",
    /**
     * The way into /admin, for the people who have one.
     *
     * The moderation surface has existed since Milestone 3 and nothing in the
     * app has ever linked to it — the only way in was typing the URL, and the
     * only way to know the URL was to have written it. Claude's words.
     */
    /**
     * Turning the drop's notification on, and what it does not say.
     *
     * The second half of that is the part worth reading: §8's whole matrix
     * exists because a push preview is visible to anybody holding the phone,
     * and a member deciding whether to allow notifications from THIS app is
     * deciding exactly that. So the control says what will appear on a lock
     * screen, in the words that will appear on it. All Claude's.
     */
    pushHeading: "Notifications",
    pushBody:
      "Tonight's Drop lands at 8pm. A notification is the only way to know without opening the app.",
    pushPrivacyNote:
      "Notifications never say who from, what about, or anything about anyone's health — just ⁺One and one short line. Your phone will also show the web address, which no app can turn off.",
    pushEnableLabel: "Turn on notifications",
    pushDisableLabel: "Turn off on this device",
    pushEnabled: "On for this device.",
    pushBlocked:
      "Your browser is blocking notifications for this site. You can allow them in its site settings.",
    /**
     * No "browser", because this is also what the native shell will read.
     *
     * push-toggle routes a WebView here: it has no PushManager — Apple gives
     * web push to Safari and to home-screen web apps and to nothing else — so
     * the shell lands in the same branch a browser without the API does.
     * "This browser cannot" is then a sentence about a browser, shown to
     * somebody standing inside an app.
     *
     * It loses a hint that was only ever true half the time — that a different
     * browser might work — in exchange for not being false anywhere. When the
     * native push path is built the shell wants its own branch and its own
     * line, because by then the answer is "not yet" rather than "not here".
     */
    pushUnsupported: "Notifications are not available here.",
    /**
     * iOS delivers web push only to a site added to the home screen, and there
     * is no API to ask — Safari offers "Add to Home Screen" from its own share
     * menu and nowhere else. So this describes the gesture rather than
     * triggering it, which is the only thing that can be done.
     */
    pushInstallFirst:
      "On iPhone, add ⁺One to your home screen first — the share button, then Add to Home Screen — and open it from there.",
    pushFailed: "That did not work. Try again in a moment.",
    /**
     * Proving the chain, in two halves.
     *
     * A push that is accepted by the push service and never appears has two
     * possible causes, and they need completely different fixes: the browser
     * refused to draw it, or the phone's own settings swallowed it. This draws
     * one locally — no server, no push service — so a member who sees nothing
     * knows the problem is on their device, and one who sees it knows it is
     * not. Claude's words.
     */
    /**
     * Installing, and what it does and does not fix.
     *
     * CORRECTION, and it matters. Claude first wrote this claiming an installed
     * app's notifications carry no web address. They do. Every web
     * notification shows its origin — Android draws "www.loveplusone.app"
     * beside the title whether the app is installed or not, and the Notification
     * API has no property that suppresses it. It is a deliberate browser
     * security feature: a member must always be able to see which site is
     * notifying them.
     *
     * What installing DOES change is the name and the icon beside it: in a
     * browser the notification is the browser's, titled by the section it came
     * from; installed, it is ⁺One's. Real, and worth doing, and less than was
     * claimed.
     *
     * The address itself is not solvable in code. It is a domain decision, or
     * an argument for a native app — see PROJECT_UPDATES. All Claude's words.
     */
    installHeading: "Add to your home screen",
    installBody:
      "Installed, ⁺One opens on its own and its notifications come from ⁺One rather than from your browser. The web address still shows beside them — no app can hide that — so a locked phone reveals the site name either way.",
    installLabel: "Install",
    // No "installed" line: the section removes itself once the app is running
    // as one, and a card whose only content is a past tense is a card nobody
    // needs to read twice.
    /**
     * iOS has no install API — Safari offers it from its own share menu and
     * nowhere else — so this describes the gesture rather than triggering it.
     */
    installIos:
      "On iPhone: the share button, then Add to Home Screen. Open ⁺One from there afterwards.",
    /** Already installed, or a browser that cannot. Neither is worth a button. */
    installUnavailable:
      "Your browser will offer this from its own menu, usually as Install app or Add to Home screen.",
    pushTestLabel: "Show a test notification",
    pushTestBody: "This is what a notification looks like.",
    pushTestShown:
      "Shown. If nothing appeared, your phone is blocking them — check its notification settings for this app.",
    adminSettingsHeading: "Moderation",
    adminSettingsBody: "Reports, verifications and the rest of the admin tools.",
    adminSettingsLink: "Open admin",
    /**
     * The third tab.
     *
     * The blocks and the threads a report took out of the inbox were two cards
     * down the middle of General. They are the only part of Settings a member
     * arrives at with something on their mind, and a list of people you had to
     * block does not belong four scrolls past a checkbox. Claude's word.
     */
    settingsSafety: "Safety",
    /**
     * No heading and no body any more.
     *
     * Signing out was a card with a title and a sentence explaining what
     * signing out is, which is a paragraph nobody has ever needed. It is a
     * button at the bottom of the page now, and the button says it.
     */
    signOutLabel: "Sign out",
    premiumHeading: "Premium",
    /**
     * Which plan you are on, which the page never said.
     *
     * It showed "Premium until 14 September" and a Manage billing button — so
     * the one question a paying member opens this screen to answer, "what am I
     * actually paying for", was answerable only by leaving for Stripe. All
     * three are Claude's words.
     */
    premiumPlanHeading: "Your plan",
    premiumPlanLine: (label: string, price: string) => `${label} — ${price}`,
    /**
     * A subscription whose price id is not one of ours. Possible after a plan
     * is retired in Stripe, and the honest answer is the status rather than a
     * guess at which of the three it was.
     */
    premiumPlanUnknown: "An active subscription",
    premiumIntro:
      "The free version is a real app. Premium raises how far you can reach — and there are things it will never buy.",
    premiumIncludesHeading: "What it gives you",
    premiumNeverHeading: "What it will never buy",
    premiumNeverNote:
      "Not at any price, not ever. These are the mechanics that make this place work, and selling exemptions from them would be selling the thing itself.",
    premiumActive: "Premium is active.",
    premiumUntil: (date: string) => `Active until ${date}.`,
    premiumFromGrant: "You have premium from invites you sent.",
    /**
     * Shown when a checkout is started by somebody who already subscribes.
     *
     * Deliberately says nothing about where to manage it. The billing portal is
     * hidden inside the native shell — guideline 3.1.1, see plan-buttons.tsx —
     * so a line pointing at it would point at something a member on a phone
     * cannot reach.
     */
    premiumAlreadySubscribed: "You already have an active subscription.",
    /**
     * The same refusal, for somebody already being charged by a store.
     *
     * This one DOES say where, unlike the line above, and the reason the two
     * differ is what each member can act on. The billing portal is hidden
     * inside the shell, so pointing at it would point at something they cannot
     * reach; a store's own subscription screen is reachable from everywhere and
     * is the only place that subscription can be changed.
     */
    premiumAlreadyStoreSubscribed: (store: string) =>
      `You already subscribe through ${store}. Manage it there.`,
    manageBillingLabel: "Manage billing",
    /**
     * Where a store subscription is managed, and the wording is deliberate.
     *
     * "Manage" rather than "Cancel": the same screen changes a plan, turns
     * auto-renew off, or does nothing, and a button that says Cancel is a
     * button people do not press when they only wanted to look.
     */
    premiumManageAppleLabel: "Manage in the App Store",
    premiumManageGoogleLabel: "Manage on Google Play",
    /**
     * Said out loud on the screen, because a member cannot otherwise tell.
     *
     * A subscription bought in the app and one bought on the web look identical
     * from inside the app, and only one of them can be cancelled here. Somebody
     * who does not know which they have will look in the wrong place first.
     */
    premiumFromApple: "Bought through the App Store.",
    premiumFromGoogle: "Bought through Google Play.",
    premiumFromStripe: "Bought on the web.",
    /**
     * Two live subscriptions at once, which should not happen and does.
     *
     * Somebody subscribes on the web, installs the app, and buys again through
     * a store. Both charge. Saying so plainly is the whole point — the failure
     * this guards against is a screen that shows one of them and quietly lets
     * the other keep billing.
     */
    premiumTwoSubscriptions:
      "You have more than one active subscription. Each has to be cancelled where it was bought.",
    /**
     * Buying inside the app, where Apple runs the sheet and we run nothing.
     *
     * Prices are never ours here. `displayPrice` comes back from StoreKit in
     * the member's own storefront currency, and `PLANS[].priceCents` is what
     * Stripe charges in USD on the web — the two agree today and are not the
     * same number, and App Store pricing moves per region without anyone here
     * touching it. A screen that promises one figure and debits another is the
     * failure these strings are shaped around.
     */
    premiumStoreLoading: "Loading plans…",
    /**
     * Not "something went wrong". The App Store being unreachable is ordinary —
     * aeroplane mode, a dead tunnel, an Apple outage — and it is fixed by
     * waiting rather than by the member doing anything differently.
     */
    premiumStoreUnavailable: "The App Store is not reachable right now. Try again in a moment.",
    /**
     * The same sentence for the other store, and it has to be its own string.
     *
     * The Android chooser reused the Apple one for a day, so a Play member was
     * told "The App Store is not reachable" on a phone that has no App Store —
     * which reads as the app being confused about what it is running on, and is
     * exactly the impression a payment screen must not give.
     */
    premiumPlayUnavailable: "Google Play is not reachable right now. Try again in a moment.",
    /**
     * Distinct from the line above, because the two are different problems and
     * only one of them is worth waiting out.
     *
     * Play billing missing entirely means this is not the installed app — a
     * browser tab on the same site, most often. "Try again" is wrong advice
     * there: trying again in the same tab will never work.
     */
    premiumPlayNotInApp: "Buying is only available in the Plus One app from Google Play.",
    /**
     * A purchase belongs to an Apple ID, so a reinstall, a new phone or a
     * second device arrives with nothing showing. Restoring is not an error
     * path; it is the normal way somebody who already pays gets their access
     * back, and it has to be visible before they conclude they were charged for
     * nothing.
     */
    premiumRestoreLabel: "Restore purchases",
    premiumRestoreNone: "Nothing to restore on this Apple ID.",
    /**
     * Ask to Buy, or a card that needs the bank's approval. The purchase is
     * real and unfinished, and it may complete minutes or days later — so this
     * must not read as a failure, and must not tell them to try again, which
     * would start a second one.
     */
    premiumPurchasePending: "Waiting for approval. Premium unlocks as soon as it comes through.",
    /**
     * The nothing-was-charged half is the point. Apple's own sheet has already
     * said whatever it says; what a member cannot tell from it is whether money
     * moved, and that is the question they will act on.
     */
    premiumPurchaseFailed: "That did not go through, and nothing has been charged.",
    /**
     * One Apple ID, two Plus One accounts. It happens honestly — a shared
     * family device, or somebody who made a second account — and the
     * subscription stays with the account that bought it. Telling them to
     * retry would be a lie; there is nothing here that trying again fixes.
     */
    premiumPurchaseNotYours:
      "This subscription is already on another Plus One account. Sign in to that account to use it.",
    /**
     * A verified purchase carrying no `appAccountToken`, so there is nothing
     * naming the member it belongs to. Refusing is deliberate — guessing
     * "probably whoever is signed in" is how one subscription unlocks several
     * people — but from the member's side it is genuinely not their fault and
     * not something they can resolve alone.
     */
    premiumPurchaseUnbound:
      "This purchase could not be matched to your account. Contact support and we will sort it out.",
    /**
     * The reverse of `premiumAlreadyStoreSubscribed`: they pay Stripe already
     * and are looking at an App Store price. Two live subscriptions is a real
     * outcome and both charge, so the sentence has to arrive before the sheet
     * does.
     */
    premiumAlreadyOnWeb:
      "You already subscribe on the web. Manage it there rather than buying again.",
    choosePlanLabel: "Choose",
    perMonth: (cents: number) => `${(cents / 100).toFixed(2)} a month`,
    photoBlurredNote: "Blurred until you connect",
    photoAlt: "Profile photo",
    photoNone: "No photo yet",
    blockLabel: "Block",
    blockConfirm:
      "Block this member? They will not see you and you will not see them. You can undo this in Settings.",
    /**
     * A confirmation, not an interrogation.
     *
     * The note on this string used to read that blocking asks nothing on
     * purpose — someone reaching for it is having the worst moment this product
     * will give them. That argument was against making them JUSTIFY it, and it
     * still holds: nothing here asks why. But block is one tap from Report in a
     * menu and cannot be undone from the chat, so a mis-tap silently removed
     * somebody. Confirming costs one press; the mis-tap cost a connection.
     */
    blockConfirmLabel: "Block them",
    blockKeepLabel: "Never mind",
    blockedHeading: "Blocked",
    /**
     * A conversation a member reported, kept where they can still reach it.
     *
     * Blocking takes the thread out of the inbox for both people, and the
     * blocked member does not keep a copy. Reporting is the act that says "I
     * may need this again", so it is the one that keeps the reporter's.
     */
    reportedThreadsHeading: "Conversations you reported",
    reportedThreadsEmpty: "Nothing here. Conversations you report stay readable from this page.",
    reportedThreadsNote: (days: number) =>
      `Kept for ${days} days, or until a moderator has finished with the report.`,
    blockedEmpty: "You have not blocked anyone.",
    unblockLabel: "Unblock",
    reportLabel: "Report",
    reportHeading: "Report this",
    reportIntro:
      "A moderator reads every report. Blocking is separate and immediate — you can do both.",
    reportReasonLabel: "What happened",
    reportDetailLabel: "Anything that would help (optional)",
    reportSubmitLabel: "Send report",
    reportSent: "Sent. A moderator will look at it.",
    reportAlsoBlock: "Block them as well",
    /**
     * The profile screen's own words, which were literals in the JSX.
     *
     * Every other screen reads its copy from here, and one that does not is one
     * the copy tests cannot see — so "Looking for" and "Not set" were the two
     * strings in the app nobody could have found by looking for strings.
     */
    profileHeading: "Profile",
    profileLookingFor: "Looking for",
    profileNotSet: "Not set",
    profileRadius: "Search radius",
    profilePhotosHeading: "Photos",
    profileNameLabel: "Your name",
    profileNameSaved: "Name saved.",
    /**
     * Changing what you are here for, and the thirty days that follow.
     *
     * §3.4 gives the lock notice ("You can change this once every 30 days")
     * but says nothing about the screen where the lock is in force, so the
     * three strings below are Claude's words and still need Kevin's.
     *
     * The date is spelled out rather than counted down. "23 days" is a number
     * a member has to convert; a date is one they can put somewhere.
     *
     * The button reuses `saveLabel`, which already exists for exactly this —
     * a settings control where "Continue" is the wrong word.
     */
    /**
     * On the profile there is no Continue to press, so the only evidence a
     * choice was taken is a line that says so. Shared by every control on that
     * page rather than owned by one of them — they were under `photos` when the
     * radius slider started using them, which is how a string ends up named
     * after the first screen that happened to need it. Claude's words.
     *
     * Shown only after a change. On load it would be a claim about an action
     * nobody took, and it would still be there after a save that failed.
     */
    settingSaving: "Saving…",
    settingSaved: "Saved",
    profileIntentionLocked: (until: string) => `You can change this again on ${until}.`,
    profileModeHeading: "Mode",
    promptsHeading: "Your prompts",
    promptsIntro:
      "People connect by replying to one of these. Answer up to three — the more specific, the better the replies.",
    promptChoose: "Choose a prompt",
    promptAnswerLabel: "Your answer",
    promptSaveLabel: "Save",
    /** Every "Add another" needs a way back, or the row is permanent. */
    promptRemoveLabel: "Remove",
    /** For settings, where "Continue" is the wrong word for a control that saves. */
    saveLabel: "Save",
    promptsEmpty:
      "You have not answered any prompts yet. Until you do, nobody can send you a connect.",
    bioHeading: "About you",
    bioLabel: "A few words",
    bioHint: (max: number) =>
      `Optional. Up to ${max} characters, and nobody has to explain themselves here.`,
    connectHeading: "Reply to a prompt",
    connectIntro:
      "Pick one of their prompts and answer it. That is the whole connect — no openers, no swiping.",
    connectSendLabel: "Send connect",
    connectNoPrompts:
      "This member has not answered any prompts yet, so there is nothing to reply to.",
    connectReplyLabel: "Your reply",
    /**
     * The second way in (Settings).
     *
     * Phrased as what it does rather than as "add an email", because members
     * reasonably assume an email on file means email FROM us. It does not —
     * §8's notification rules are unchanged and this address is used for one
     * thing.
     */
    emailHeading: "A second way to sign in",
    emailBody:
      "Add an email and you can get your sign-in code there instead of by text — useful if you change your number or lose your phone. It is only ever used to send you a code. We do not email you anything else, and it is never shown to anyone.",
    emailLabel: "Email",
    emailAddLabel: "Send a confirmation",
    emailChangeLabel: "Use a different email",
    emailPending: (email: string) =>
      `Check ${email} and open the link to confirm it. Until you do, your number is still the only way in.`,
    emailConfirmed: (email: string) => `You can sign in with ${email} or with your number.`,
    emailNone: "Right now your number is the only way in.",
    emailErrors: {
      required: "Enter an email address.",
      invalid: "That does not look like an email address.",
      unchanged: "That is already the email on your account.",
      phoneNotConfirmed:
        "Confirm your number first. An email is a second way into your account, not a first one.",
      taken: "That email is already on another account.",
      failed: "We could not save that just now. Try again in a moment.",
    },
    navSettings: "Settings",
    crossCommunityHeading: "Other communities",
    deleteHeading: "Delete your account",
    deleteConfirmLabel: "Type DELETE to confirm",
    deleteButton: "Delete everything",
    inviteHeading: "Invite someone",
    inviteCopyLabel: "Copy your link",
    inviteCopied: "Copied.",
    /** Clipboard access can simply be refused — an insecure context, a denied permission. */
    inviteCopyFailed: "That didn't copy. You can select the link above instead.",
    navInvite: "Invite",
    roomNoDmNote:
      "You can reach someone here through a connect — there are no direct messages in rooms.",
    previewCtaAria: "Switch to dating mode to connect",
    /**
     * The list, and the bell that leads to it.
     *
     * §8 built a matrix of pushes and nothing a member could look at. A push is
     * a MOMENT: dismiss it, or have the phone face down, and the thing that
     * happened is gone — and everything in this app that matters arrived
     * exactly once. All Claude's words.
     */
    notificationsHeading: "Notifications",
    notificationsEmpty: "Nothing yet. What happens here will show up in this list.",
    /**
     * Named for a screen reader, which otherwise announces a bell as "link".
     * The count is in the label rather than only in the badge, because the
     * badge is a coloured dot to anyone not looking at it.
     */
    notificationsBellLabel: (unread: number) =>
      unread === 0 ? "Notifications" : `Notifications, ${unread} unread`,
    /**
     * The list keeps everything and marks it, rather than emptying.
     *
     * A notification list that clears is a list you cannot go back to — and the
     * one case where somebody comes looking is the one they already dismissed.
     * There is no "mark all as read" button either: opening the list is what
     * marks it, in an after() once the response has gone, so the render the
     * member is looking at still shows what was new.
     *
     * Which leaves the dot as the only thing saying so, and a dot is nothing at
     * all to somebody listening. This is the word it says instead.
     */
    notificationsUnreadDivider: "New",
    /** Settings, where each of these can be turned off. */
    settingsNotifications: "Notifications",
    notificationSettingsHeading: "What you're told about",
    notificationSettingsBody:
      "Every one of these is off or on per channel. In-app is the list behind the bell; push reaches your phone; email arrives as one line with nothing in it.",
    notificationSettingsAlwaysOn:
      "Always on. You are waiting on a person to look at your account, and there is nothing else to check.",
    notificationSettingsSaveFailed: "That didn't save. Try again in a moment.",
    /**
     * Turning something on that the device is not set up for.
     *
     * A push switch flipped on in an account that has no push subscription does
     * exactly nothing, silently, and the member has no way to tell that from a
     * broken feature.
     */
    notificationSettingsPushOff:
      "Push is off for this device. Turn it on above and these will start arriving.",
  },
} as const;

/**
 * What each notification SAYS in the list, given whatever name the reader is
 * allowed to see.
 *
 * DRAFT — all Claude's words, none reviewed.
 *
 * These are deliberately not the push templates. A push is read on a lock
 * screen by whoever is holding the phone, so `NOTIFICATIONS` says as little as
 * it can and `buildPayload` refuses a condition word. This list is behind the
 * login, on a screen already showing names and messages, so it can afford to
 * say who — and it says who by being HANDED a name at render time rather than
 * by having stored one. A member since blocked, an anonymous author, an
 * account since deleted: all arrive here as null, and each line has an answer
 * for that.
 *
 * Two of them never take a name even when one is available. A like is the one
 * interaction the rooms do not attribute — the post shows a count and never
 * who — so naming the liker here would invent a disclosure the interface
 * deliberately does not make. And nothing about a moderator reaches the member
 * they decided about.
 */
export type NotificationLine = (
  actor: string | null,
  /**
   * Whether the thing this is about is a comment rather than a post.
   *
   * Null when it cannot be told — the row was deleted, or the reader may no
   * longer see it — and the line then says the thing that is true either way
   * rather than guessing. `my_notifications` resolves it at read time.
   */
  subjectIsComment?: boolean | null,
) => string;

export const NOTIFICATION_LINES: Record<NotificationEvent, NotificationLine> = {
  drop_ready: () => "Tonight's Drop is ready.",
  connect_received: (actor) =>
    actor ? `${actor} sent you a connect.` : "Someone sent you a connect.",
  connect_accepted: (actor) =>
    actor ? `${actor} accepted your connect.` : "Your connect was accepted.",
  connect_expiring: () => "A connect is waiting on your answer, and runs out tomorrow.",
  message_received: (actor) => (actor ? `${actor} sent you a message.` : "You have a new message."),
  fuse_warning: () => "One of your chats closes tomorrow.",
  chat_closed: () => "A chat has closed. There's a note waiting in it.",
  plan_proposed: (actor) => (actor ? `${actor} proposed a plan.` : "Someone proposed a plan."),
  plan_confirmed: (actor) => (actor ? `${actor} confirmed the plan.` : "A plan is confirmed."),
  like_received: () => "Someone liked your post.",
  /**
   * Which of the two it was, when that is knowable.
   *
   * A thread is a post, comments on it, and replies under those — so this
   * fires to the author of a post OR of a comment, and it said "your post"
   * both times. Half of them sent somebody looking for a reply on something
   * they had not written.
   */
  reply_received: (actor, onAComment) => {
    const what = onAComment == null ? "you" : onAComment ? "your comment" : "your post";
    return actor ? `${actor} replied to ${what}.` : `Someone replied to ${what}.`;
  },
  mention_received: (actor) => (actor ? `${actor} mentioned you.` : "Someone mentioned you."),
  verification_decided: () => "Your verification has been reviewed.",
  premium_expiring: () => "Your premium is ending soon.",
  nearby_joins: () => "New members joined near you.",
  referral_converted: () => "Someone you invited joined and was verified.",
};

/**
 * The name of each switch on the settings screen.
 *
 * DRAFT — Claude's words. These name the EVENT rather than restate the
 * message: a member scanning fourteen rows for the one they want to silence is
 * reading labels, not sentences.
 */
export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  drop_ready: "Tonight's Drop",
  connect_received: "Someone connects with you",
  connect_accepted: "Your connect is accepted",
  connect_expiring: "A connect is about to run out",
  message_received: "New messages",
  fuse_warning: "A chat is about to close",
  chat_closed: "A chat has closed",
  plan_proposed: "Someone proposes a plan",
  plan_confirmed: "A plan is confirmed",
  like_received: "Likes on your posts",
  reply_received: "Replies to you",
  mention_received: "Someone tags you",
  verification_decided: "Your verification is decided",
  premium_expiring: "Premium is ending",
  nearby_joins: "New members near you",
  referral_converted: "Someone you invited joins",
};

/** DRAFT — Claude's words. The three columns, named for the header row. */
export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: "In app",
  push: "Push",
  email: "Email",
};

/**
 * Profile prompts (Decision #14).
 *
 * DRAFT — NOT FROM THE SPEC, and load-bearing in a way the other gaps are not.
 *
 * Decision #14 makes a connect "a reply to a specific prompt on the profile" —
 * that is the mechanic that stops swipe-and-spray, and §5.2 gives profiles a
 * `prompts` column. But the spec never writes the prompts themselves, and
 * without any there is nothing to reply to and no connect can be sent at all.
 *
 * So these are drafted rather than deferred. They are chosen to be answerable
 * by someone having a bad month, to invite a specific reply rather than a
 * clever one, and never to ask about anyone's status — a prompt that fishes for
 * a diagnosis story would undo the point of the place.
 */
/**
 * §5.2's report_reason enum, in words. The enum values are database identifiers;
 * a member choosing why they are reporting someone should not be reading
 * `sexual_content`.
 */
export const REPORT_REASONS = {
  fake_profile: "This profile is not a real person",
  harassment: "Harassment or abuse",
  sexual_content: "Unwanted sexual content",
  spam_or_scam: "Spam or a scam",
  underage: "This person is under 18",
  other: "Something else",
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

export const REPORT_DETAIL_MAX_CHARS = 1000;

export const PROFILE_PROMPTS = [
  { id: "sunday", question: "A Sunday that went right looks like" },
  { id: "laugh", question: "The last thing that actually made me laugh" },
  { id: "know", question: "Something worth knowing about me early" },
  { id: "good_at", question: "I am unreasonably good at" },
  { id: "learning", question: "I am trying to get better at" },
  { id: "together", question: "We would get on if you also" },
  { id: "feel_seen", question: "I feel most myself when" },
  { id: "small_thing", question: "A small thing that means a lot" },
] as const;

export type ProfilePromptId = (typeof PROFILE_PROMPTS)[number]["id"];

/** §5.2 — profiles.prompts is a jsonb array of these. */
export interface ProfilePromptAnswer {
  readonly id: string;
  readonly answer: string;
}

export const PROMPT_ANSWER_MAX_CHARS = 300;
export const MAX_PROMPTS = 3;

export function promptQuestion(id: string): string | null {
  return PROFILE_PROMPTS.find((p) => p.id === id)?.question ?? null;
}

/**
 * The §7.2 compatibility quiz — 12 questions across six traits.
 *
 * DRAFT — not from the spec, written at Kevin's request.
 *
 * Three rules they are held to:
 *
 *   · Never about anyone's status. Not obliquely, not "how open are you about
 *     health". The quiz shapes who members are shown to each other, and a
 *     question that sorted people by how they feel about their diagnosis would
 *     be the app doing the sorting nobody asked for.
 *   · Answerable by someone having a bad month. Nothing that rewards being
 *     interesting, nothing that punishes a quiet answer.
 *   · No right answer. Every option is a way of being rather than a score, so
 *     the weights run negative to positive on a trait rather than low to high
 *     on a quality.
 *
 * The weights feed a trait vector in packages/logic/quiz, which feeds
 * quizCompat in the Drop. §10 allows shipping without any of this — an empty
 * array turns the step off and scores everyone neutral.
 */
export const QUIZ_TRAITS = [
  "pace",
  "social",
  "plans",
  "directness",
  "steadiness",
  "openness",
] as const;

export type QuizTrait = (typeof QUIZ_TRAITS)[number];

export interface QuizOption {
  readonly id: string;
  readonly label: string;
  /** -1 to 1 along this question's trait. No option is worth more than another. */
  readonly weight: number;
}

export interface QuizQuestion {
  readonly id: string;
  readonly trait: QuizTrait;
  readonly question: string;
  readonly options: readonly QuizOption[];
}

const SCALE = [1, 0.34, -0.34, -1] as const;
const opts = (...labels: [string, string, string, string]): readonly QuizOption[] =>
  labels.map((label, i) => ({
    id: String.fromCharCode(97 + i),
    label,
    weight: SCALE[i] as number,
  }));

export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  {
    id: "pace_going_well",
    trait: "pace",
    question: "When something is going well, I want to",
    options: opts(
      "talk every day",
      "check in most days",
      "let it breathe a bit",
      "let it find its own speed",
    ),
  },
  {
    id: "pace_next_plan",
    trait: "pace",
    question: "After a good first meeting, the next plan gets made",
    options: opts(
      "before we say goodbye",
      "that evening",
      "sometime in the next few days",
      "when one of us thinks of it",
    ),
  },
  {
    id: "social_friday",
    trait: "social",
    question: "A free Friday night is best spent",
    options: opts("out, with a crowd", "with a few friends", "with one person", "on my own"),
  },
  {
    id: "social_party",
    trait: "social",
    question: "At a party I usually",
    options: opts(
      "have talked to everyone by the end",
      "find two or three good conversations",
      "stay near whoever I came with",
      "take a lot of trips to the kitchen",
    ),
  },
  {
    id: "plans_trip",
    trait: "plans",
    question: "A trip works best when it is",
    options: opts(
      "planned properly",
      "roughly planned",
      "a rough idea and a train ticket",
      "decided that morning",
    ),
  },
  {
    id: "plans_sunday",
    trait: "plans",
    question: "Sunday morning, I am",
    options: opts(
      "up and already doing something",
      "slow to start, then out",
      "seeing what happens",
      "still in bed, unrepentant",
    ),
  },
  {
    id: "direct_bothered",
    trait: "directness",
    question: "When something bothers me, I",
    options: opts(
      "say so at the time",
      "say so once I have thought about it",
      "wait to see if it matters",
      "usually let it go",
    ),
  },
  {
    id: "direct_disagree",
    trait: "directness",
    question: "When we disagree, I would rather",
    options: opts(
      "talk it through now",
      "take a minute, then talk",
      "write it down first",
      "let it settle on its own",
    ),
  },
  {
    id: "steady_week",
    trait: "steadiness",
    question: "My ideal week",
    options: opts(
      "has the same shape every week",
      "is mostly steady",
      "has a couple of surprises in it",
      "looks nothing like the last one",
    ),
  },
  {
    id: "steady_holiday",
    trait: "steadiness",
    question: "Holidays: I go",
    options: opts(
      "back to the place I love",
      "somewhere new, well researched",
      "somewhere new, figured out on arrival",
      "wherever is cheap on the day",
    ),
  },
  {
    id: "open_early",
    trait: "openness",
    question: "Early on, I tend to",
    options: opts(
      "say most of it quite quickly",
      "open up steadily",
      "take a while to get there",
      "keep things close for a long time",
    ),
  },
  {
    id: "open_hard_things",
    trait: "openness",
    question: "The things I am working on, I talk about",
    options: opts(
      "openly, with most people",
      "with the people I trust",
      "rarely, and only when asked",
      "almost never",
    ),
  },
] as const;

export const QUIZ_QUESTION_COUNT = QUIZ_QUESTIONS.length;

/**
 * Labels for the intention enum. §3.4 gives the lock notice but not the option
 * names, so these are drafts too.
 */
export const INTENTION_LABELS = {
  long_term: "Something long term",
  casual: "Something casual",
  /**
   * After the two it refers to, not between them. "Open to either" listed
   * second asked a member to hold an option they had not been offered yet.
   *
   * Display order only. The enum's own order is unchanged, and intentionCompat
   * scores off a keyed affinity matrix rather than a position, so nothing about
   * matching moves with this.
   */
  open_to_either: "Open to either",
  friends_support: "Friends and support",
} as const;

export type Intention = keyof typeof INTENTION_LABELS;

/**
 * Labels for the gender_identity enum.
 *
 * DRAFTS, and the ones on this page most worth reading: an option list for
 * gender is a statement about who the product thinks its members are, and a
 * member who does not find themselves in it learns something in the first two
 * minutes that no later screen undoes.
 *
 * Four is the smallest set that is not exclusionary, and it is deliberately not
 * a taxonomy — this app already asks people to disclose a diagnosis, and
 * following that with a long identity questionnaire spends trust it needs
 * elsewhere. Widening the enum later costs one migration; it is meant to be
 * widened rather than treated as settled.
 */
export const GENDER_LABELS = {
  woman: "Woman",
  man: "Man",
  non_binary: "Non-binary",
  other: "Another identity",
} as const;

export type Gender = keyof typeof GENDER_LABELS;

/**
 * The same four, asked the other way round. Multi-select: "who you would like
 * to meet" is a set, and a member open to more than one gender is not an edge
 * case to be squeezed into a single radio.
 *
 * Choosing NOTHING means no preference rather than nobody — see the mutual
 * filter in drop_candidates, which treats an empty set as "everyone".
 */
export const SEEKING_LABELS = GENDER_LABELS;

/** Labels for the lifestyle_frequency enum, shared by smoking and drinking. */
export const FREQUENCY_LABELS = {
  never: "No",
  sometimes: "Sometimes",
  often: "Regularly",
} as const;

/** Labels for the kids_status enum — what is true now. */
export const KIDS_LABELS = {
  none: "No kids",
  have: "Kids at home",
  have_grown: "Kids, grown up",
} as const;

/** Labels for the kids_plan enum — what someone wants later. */
export const KIDS_PLAN_LABELS = {
  want: "Want kids",
  open: "Open to kids",
  no: "Do not want kids",
  unsure: "Not sure yet",
} as const;

/**
 * Labels for the condition_detail enum. These are names for things, not
 * marketing, so they are stated the way the communities themselves state them.
 */
export const CONDITION_LABELS = {
  hsv1: "HSV-1",
  hsv2: "HSV-2",
  hsv1_hsv2: "HSV-1 and HSV-2",
  hiv: "HIV",
  hiv_hsv: "HIV and HSV",
} as const;

export const COMMUNITY_LABELS = {
  hsv: "HSV",
  hiv: "HIV",
} as const;

/**
 * Which conditions belong to which community.
 *
 * This MUST match the profiles_condition_matches_community CHECK in the SQL. A
 * unit test asserts it against the migration text, because a mismatch here does
 * not fail loudly — it offers a member a choice the database will then refuse,
 * at the end of a form they have already filled in.
 */
export const CONDITIONS_BY_COMMUNITY = {
  hsv: ["hsv1", "hsv2", "hsv1_hsv2"],
  hiv: ["hiv", "hiv_hsv"],
} as const;

export type Community = keyof typeof CONDITIONS_BY_COMMUNITY;
export type ConditionDetail = keyof typeof CONDITION_LABELS;

/** §5.2 — the U=U badge is only meaningful for the HIV community. */
export function allowsUEqualsU(community: Community): boolean {
  return community === "hiv";
}

export function isValidPair(community: Community, condition: ConditionDetail): boolean {
  return (CONDITIONS_BY_COMMUNITY[community] as readonly string[]).includes(condition);
}
