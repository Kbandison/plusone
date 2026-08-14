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
  phone: {
    heading: "Your number",
    intro:
      "We text you a code to sign in. Your number is never shown to anyone, and it is not used to find you.",
    phoneLabel: "Mobile number",
    phoneHint: "Include your country code, like +1.",
    sendLabel: "Send code",
    codeHeading: "Enter the code",
    codeIntro: "We sent a six-digit code. It is good for ten minutes.",
    codeLabel: "Code",
    verifyLabel: "Verify",
    resendLabel: "Send it again",
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
    uEqualsUHint:
      "Undetectable equals untransmittable. Only you decide whether this appears.",
    errors: {
      communityRequired: "Choose a community.",
      conditionRequired: "Choose one.",
      mismatch: "That combination is not one of the options.",
    },
  },

  liveness: {
    heading: "A quick selfie",
    intro:
      "Every profile here is a verified human. One selfie, checked automatically, and the picture is deleted the moment the check finishes. It is never shown to anyone.",
    startLabel: "Take the selfie",
    checkingLabel: "Checking…",
    retryLabel: "Try again",
    retriesLeft: (n: number) => `${n} ${n === 1 ? "attempt" : "attempts"} left before a person takes a look.`,
    flaggedHeading: "We will take a look",
    flaggedBody:
      "The automatic check could not decide. Someone on our team will review it, usually within a day. You do not need to do anything.",
    errors: {
      failed: "That did not pass. Make sure your face is well lit and fills the frame.",
      unavailable: "The check is unavailable right now. Try again in a moment.",
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
    blurredHint: "People see that you have photos, and see them properly once you have both said yes.",
    errors: {
      required: "Add at least one photo.",
      tooLarge: "That image is larger than 8 MB.",
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
    previewCtaAria: "Switch to dating mode to connect",
  },
} as const;

/**
 * The §7.2 compatibility quiz — 10 to 12 questions.
 *
 * DELIBERATELY EMPTY. The spec asks for the quiz but never writes the
 * questions, and §10's cut order says in as many words: "ship with
 * intention-weighting only, quiz in fast-follow". Ten to twelve invented
 * questions would shape who members are shown to each other, which is not a
 * thing to guess at.
 *
 * The step stays in the §7.2 order. `quizSettled` treats an empty question set
 * as nothing to answer, so onboarding does not stall on a screen with no
 * content — and the step turns itself on the moment a question is added here.
 */
export const QUIZ_QUESTIONS: readonly { id: string; prompt: string; options: readonly string[] }[] =
  [];

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
