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
    privacyLink: "How we handle your data",
  },

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
    blockLabel: "Block",
    blockConfirm: "Block this member? They will not see you and you will not see them. You can undo this in Settings.",
    blockedHeading: "Blocked",
    blockedEmpty: "You have not blocked anyone.",
    unblockLabel: "Unblock",
    reportLabel: "Report",
    reportHeading: "Report this",
    reportIntro: "A moderator reads every report. Blocking is separate and immediate — you can do both.",
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
    promptsEmpty: "You have not answered any prompts yet. Until you do, nobody can send you a connect.",
    bioHeading: "About you",
    bioLabel: "A few words",
    connectHeading: "Reply to a prompt",
    connectIntro: "Pick one of their prompts and answer it. That is the whole connect — no openers, no swiping.",
    connectSendLabel: "Send connect",
    connectNoPrompts: "This member has not answered any prompts yet, so there is nothing to reply to.",
    connectReplyLabel: "Your reply",
    navSettings: "Settings",
    crossCommunityHeading: "Other communities",
    deleteHeading: "Delete your account",
    deleteConfirmLabel: "Type DELETE to confirm",
    deleteButton: "Delete everything",
    inviteHeading: "Invite someone",
    inviteCopyLabel: "Copy your link",
    inviteCopied: "Copied.",
    navInvite: "Invite",
    roomNoDmNote: "You can reach someone here through a connect — there are no direct messages in rooms.",
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
