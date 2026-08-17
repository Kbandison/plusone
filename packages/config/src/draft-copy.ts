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

export const DRAFT_COPY = {
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
    phoneHint: "Include your country code, like +1.",
    /**
     * The SMS opt-in disclosure (carrier A2P requirement).
     *
     * Campaign review wants to see the consent moment itself, so this sits
     * under the number field rather than in the terms. It says codes only,
     * because that is true and because it is the thing a person is agreeing to.
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
     * A2P disclosure belongs at the moment the message is sent rather than in a
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
    finishLabel: "Done",
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
  },

  intention: {
    heading: "What you are here for",
    intro: "This shapes who you see. Be honest — everyone here is.",
    errors: { required: "Choose one." },
  },

  photos: {
    heading: "Your photos",
    intro: "At least one photo, and you choose who gets to see it clearly.",
    addLabel: "Add a photo",
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
    },
  },

  radius: {
    heading: "How far you will go",
    intro:
      "We look for people within this distance first. If there are not many nearby, we widen the search for that night and tell you we did.",
    label: "Search radius",
    unit: (mi: number) => `${mi} miles`,
    continueLabel: "Finish",
  },

  app: {
    dropEmptyHeading: "Nothing tonight",
    navHome: "Tonight",
    navBrowse: "Browse",
    navInbox: "Inbox",
    navChats: "Chats",
    navRooms: "Rooms",
    navProfile: "You",
    connectLabel: "Connect",
    inboxHeading: "Waiting on you",
    inboxSentHeading: "Sent",
    inboxEmpty: "Nothing waiting.",
    acceptLabel: "Accept",
    declineLabel: "Decline",
    chatsHeading: "Chats",
    chatsEmpty: "No chats yet.",
    fuseDaysLeft: (days: number) => `${days} ${days === 1 ? "day" : "days"} left`,
    fuseExpiringSoon: "Closes tomorrow",
    datePlannedLabel: "Date planned",
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
    filterDistance: "Within",
    filterIntention: "Looking for",
    filterActive: "Active this week only",
    filterAny: "Any",
    applyFiltersLabel: "Apply",
    roomsHeading: "Rooms",
    roomsEmpty: "No rooms yet.",
    roomJoinLabel: "Join",
    roomPostPlaceholder: "Say something to the room",
    roomPostLabel: "Post",
    roomSlowMode: (seconds: number) => `Slow mode: one message every ${seconds} seconds.`,
    settingsHeading: "Settings",
    signOutHeading: "Sign out",
    signOutBody:
      "Signs you out on this device. Your account and everything in it stay exactly as they are.",
    signOutLabel: "Sign out",
    premiumHeading: "Premium",
    navPremium: "Premium",
    premiumIntro:
      "The free version is a real app. Premium raises how far you can reach — and there are things it will never buy.",
    premiumIncludesHeading: "What it gives you",
    premiumNeverHeading: "What it will never buy",
    premiumNeverNote:
      "Not at any price, not ever. These are the mechanics that make this place work, and selling exemptions from them would be selling the thing itself.",
    premiumActive: "Premium is active.",
    premiumUntil: (date: string) => `Active until ${date}.`,
    premiumFromGrant: "You have premium from invites you sent.",
    manageBillingLabel: "Manage billing",
    choosePlanLabel: "Choose",
    perMonth: (cents: number) => `${(cents / 100).toFixed(2)} a month`,
    photoBlurredNote: "Blurred until you connect",
    photoAlt: "Profile photo",
    photoNone: "No photo yet",
    blockLabel: "Block",
    blockConfirm:
      "Block this member? They will not see you and you will not see them. You can undo this in Settings.",
    blockedHeading: "Blocked",
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
  },
} as const;

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
  open_to_either: "Open to either",
  casual: "Something casual",
  friends_support: "Friends and support",
} as const;

export type Intention = keyof typeof INTENTION_LABELS;

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
