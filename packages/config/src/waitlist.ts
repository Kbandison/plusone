/**
 * The waitlist, and the closed beta it feeds.
 *
 * ── why this exists at all ──────────────────────────────────────────────────
 *
 * This app already admits, in three separate strings, that a thin local pool is
 * a real outcome: COPY.drop.thin ("Fewer people near you tonight"),
 * COPY.radius.expansionNotice, and HOW_IT_WORKS' "if there are not many people
 * near you, you get fewer and we say so". That honesty is right and it was, up
 * to now, a dead end — a member who met it had nothing to do but leave.
 *
 * A waitlist is what turns those three apologies into a plan. Hold people by
 * metro, open a metro when it is dense enough to be worth opening, and tell the
 * people who were waiting. Nothing else in the product can do that.
 *
 * ── the constraint that shapes every field below ────────────────────────────
 *
 * AN EMAIL ADDRESS ON THIS LIST IS A HEALTH DISCLOSURE BY INFERENCE. Plus One
 * is a named, public, HSV-and-HIV app; being on its list says something about
 * the person that they may not have said to anybody else. That is not true of
 * an ordinary waitlist and it is why this file is longer than a waitlist needs
 * to be.
 *
 * What follows from it, and each is enforced somewhere rather than intended:
 *
 *   the condition      IS NOT ASKED. It buys nothing a launch decision needs —
 *                      density is density — and asking converts an inference
 *                      into a record. `WAITLIST_NEVER` below is the list, and
 *                      waitlist.test.ts refuses any field named in it.
 *   the area           A metro, chosen from a fixed list. Coarse by
 *                      construction: there is no free-text place, no ZIP and no
 *                      geolocation, so the finest thing this table can ever say
 *                      about anyone is which of ~40 regions they picked.
 *   the address        Confirmed before it counts. An unconfirmed row is
 *                      somebody who never asked — see WAITLIST_DOUBLE_OPT_IN.
 *   the subject line   Neutral. See WAITLIST_EMAIL below, which is the part of
 *                      this file most likely to be "improved" by somebody who
 *                      has not read this paragraph.
 *   leaving            One click, no account, no sign-in. Also what Play's
 *                      deletion-URL requirement wants.
 */

/**
 * Every metro the waitlist can name.
 *
 * ── why a fixed list and not a text box ─────────────────────────────────────
 *
 * A text box would accept "Brooklyn", "bk", "NYC", "New York, NY" and a street
 * address, and the last of those is the problem: a free-text place field on
 * this app is an invitation to type something far more identifying than was
 * ever asked for, and it would be stored verbatim. A select cannot be
 * over-answered.
 *
 * ── the order is alphabetical, deliberately ─────────────────────────────────
 *
 * The operationally useful order would be by expected density, which for this
 * app tracks published HIV-prevalence data. Presenting it that way would rank
 * American cities by diagnosis rate on a public page, which is a thing this
 * product should not do even where the data is public. Launch order is a
 * decision made against the list, not a property of it.
 *
 * `elsewhere` is last and is not a metro. Somebody outside all of these should
 * still be able to say so — the alternative is a form they cannot complete —
 * and it is genuinely useful: a hundred rows on `elsewhere` is the signal that
 * this list is too short.
 */
export interface Metro {
  readonly id: string;
  readonly label: string;
}

export const METROS: readonly Metro[] = [
  { id: "atlanta", label: "Atlanta, GA" },
  { id: "austin", label: "Austin, TX" },
  { id: "baltimore", label: "Baltimore, MD" },
  { id: "birmingham", label: "Birmingham, AL" },
  { id: "boston", label: "Boston, MA" },
  { id: "charlotte", label: "Charlotte, NC" },
  { id: "chicago", label: "Chicago, IL" },
  { id: "cleveland", label: "Cleveland, OH" },
  { id: "columbus", label: "Columbus, OH" },
  { id: "dallas", label: "Dallas–Fort Worth, TX" },
  { id: "denver", label: "Denver, CO" },
  { id: "detroit", label: "Detroit, MI" },
  { id: "houston", label: "Houston, TX" },
  { id: "indianapolis", label: "Indianapolis, IN" },
  { id: "jacksonville", label: "Jacksonville, FL" },
  { id: "kansas-city", label: "Kansas City, MO" },
  { id: "las-vegas", label: "Las Vegas, NV" },
  { id: "los-angeles", label: "Los Angeles, CA" },
  { id: "memphis", label: "Memphis, TN" },
  { id: "miami", label: "Miami–Fort Lauderdale, FL" },
  { id: "milwaukee", label: "Milwaukee, WI" },
  { id: "minneapolis", label: "Minneapolis–St Paul, MN" },
  { id: "nashville", label: "Nashville, TN" },
  { id: "new-orleans", label: "New Orleans, LA" },
  { id: "new-york", label: "New York, NY" },
  { id: "oklahoma-city", label: "Oklahoma City, OK" },
  { id: "orlando", label: "Orlando, FL" },
  { id: "philadelphia", label: "Philadelphia, PA" },
  { id: "phoenix", label: "Phoenix, AZ" },
  { id: "pittsburgh", label: "Pittsburgh, PA" },
  { id: "portland", label: "Portland, OR" },
  { id: "raleigh", label: "Raleigh–Durham, NC" },
  { id: "richmond", label: "Richmond, VA" },
  { id: "sacramento", label: "Sacramento, CA" },
  { id: "salt-lake-city", label: "Salt Lake City, UT" },
  { id: "san-antonio", label: "San Antonio, TX" },
  { id: "san-diego", label: "San Diego, CA" },
  { id: "san-francisco", label: "San Francisco Bay Area, CA" },
  { id: "seattle", label: "Seattle, WA" },
  { id: "st-louis", label: "St Louis, MO" },
  { id: "tampa", label: "Tampa–St Petersburg, FL" },
  { id: "washington", label: "Washington, DC" },
  { id: "elsewhere", label: "Somewhere else" },
];

export const METRO_IDS: readonly string[] = METROS.map((m) => m.id);

export function isMetro(id: string): boolean {
  return METRO_IDS.includes(id);
}

export function metroLabel(id: string): string | null {
  return METROS.find((m) => m.id === id)?.label ?? null;
}

/**
 * What this list must never hold, whatever anybody's reason.
 *
 * Pinned by `waitlist.test.ts`, which reads the migration and fails on a column
 * matching any of these. A list is a thing people add "just one more field" to,
 * and every one of these has a plausible-sounding argument for it:
 *
 *   condition / community  "so we know who to launch for" — density is density,
 *                          and this is the disclosure the whole app exists to
 *                          make optional and private. Never.
 *   date_of_birth / age    The 18+ wall belongs at account creation, where a
 *                          CHECK constraint enforces it. A birthdate here is a
 *                          second copy of an identifier for no gain.
 *   name                   Nothing sends to a name. An address is enough.
 *   phone                  A second identifier, and the one that signs a member
 *                          in. Collecting it before there is an account means
 *                          holding a sign-in credential for a non-member.
 *   lat / lng / postcode /
 *   address / ip           The metro IS the location field. Anything finer is a
 *                          smaller haystack around a health inference.
 *   referrer / utm_*       Attribution is analytics, and there is no analytics
 *                          SDK in this app. Adding it here would make that
 *                          sentence false in both stores' forms.
 */
export const WAITLIST_NEVER: readonly string[] = [
  "condition",
  "condition_detail",
  "community",
  "u_equals_u",
  "date_of_birth",
  "birthdate",
  "age",
  "name",
  "display_name",
  "full_name",
  "phone",
  "lat",
  "lng",
  "latitude",
  "longitude",
  "postcode",
  "postal_code",
  "zip",
  "address",
  "ip",
  "ip_address",
  "user_agent",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
];

/**
 * Confirmation is not politeness, it is the fix for a specific attack.
 *
 * Without it, anybody can type somebody else's address into this form and that
 * person is on a list for an HSV and HIV app. Confirmation does not stop the
 * one email arriving — nothing can — but it stops the row COUNTING: an
 * unconfirmed address is never invited, never included in a density figure, and
 * is swept after WAITLIST_UNCONFIRMED_TTL_DAYS.
 *
 * Which is why the first email matters more here than the second. See below.
 */
export const WAITLIST_DOUBLE_OPT_IN = true;
export const WAITLIST_UNCONFIRMED_TTL_DAYS = 30;

/**
 * The emails, and the rule that governs all of them.
 *
 * ── a subject line is read by more people than the email is ─────────────────
 *
 * It arrives on a lock screen. On a shared phone, on a work laptop, over
 * somebody's shoulder on a train. A subject naming HSV, HIV, a diagnosis, or
 * "positive singles" is a disclosure the recipient did not make, delivered to
 * whoever happened to be looking — and it is irreversible in a way an unwanted
 * email is not.
 *
 * So every subject here is neutral to the point of being dull, and that is the
 * specification rather than a lack of effort. `waitlist.test.ts` checks each of
 * them against BANNED_COPY_TERMS and against the condition vocabulary.
 *
 * The BODY may be specific — by the time it is open, the person has chosen to
 * open it. The preview text may not be, for the same reason as the subject.
 *
 * The sending domain is already deliberately non-obvious (loveplusone.app names
 * no condition), and RESEND_FROM is a support@ address that can receive. Both
 * are load-bearing and neither should be changed without re-reading this.
 */
export interface WaitlistEmail {
  readonly subject: string;
  /** The first line a client shows beside the subject. Same rule as the subject. */
  readonly preview: string;
  readonly body: readonly string[];
}

export const WAITLIST_EMAIL: Record<"confirm" | "invite", WaitlistEmail> = {
  confirm: {
    subject: "Confirm your email address",
    preview: "One tap to confirm, or ignore this and nothing happens.",
    body: [
      "Someone entered this address to hear when Plus One opens in their area. If that was you, confirm below and we will let you know.",
      "If it was not you, ignore this email. Nothing has been added, nothing will be sent again, and the address is removed on its own within 30 days.",
    ],
  },
  invite: {
    subject: "Your invitation is ready",
    preview: "A link to get in, good for one account.",
    body: [
      "Plus One is open in your area, and you are invited to the beta.",
      "The link below is yours and works once. It expires in 14 days.",
      "You can leave the list at any time, and there is a link at the bottom of every email we send.",
    ],
  },
};

/** How long an invite link is good for. */
export const WAITLIST_INVITE_TTL_DAYS = 14;

/**
 * What a metro needs before it is worth opening.
 *
 * Not enforced anywhere — it is a number to argue with rather than a gate, and
 * the decision to open a metro is Kevin's. It is here so the admin screen can
 * show progress against something instead of a bare count, and so the number
 * gets revised in one place when it turns out to be wrong.
 *
 * The reasoning: DROP.perNight is three, and a Drop that can only ever show the
 * same few people is worse than no Drop. Thirty confirmed addresses in a metro
 * is roughly the point at which a first week has somebody new in it most
 * nights, allowing for the ones who never sign up.
 */
export const WAITLIST_METRO_TARGET = 30;

/**
 * How a beta tester actually gets the app, per platform.
 *
 * ── the gap this closes ─────────────────────────────────────────────────────
 *
 * The first version of this feature invited people to a beta and then told them
 * nothing about how to be in it. `/beta/<code>` said "you are invited", offered
 * a Start button into web onboarding, and hid the store-account question in a
 * fold BELOW it. So a tester's actual journey — give us the right address, wait
 * to be added to a store track, install from the store — was described nowhere,
 * and the one question that determines all of it was an afterthought.
 *
 * ── the thing worth saying first ────────────────────────────────────────────
 *
 * THE WEB APP IS THE APP. Android ships as a TWA, which is Chrome running
 * apps/web with the address bar removed, and the iOS shell is a WKWebView
 * pointed at the same origin. So "install" is about notifications, an icon and
 * a store relationship — it is not the difference between using Plus One and
 * not using it. Saying so removes the wait from the critical path: a tester can
 * start now, in a browser, while a store invitation is still being arranged.
 *
 * Every step below is what the person does, not what we do. A list of our
 * internal actions reads as progress and answers none of their questions.
 */
export type BetaPlatform = "android" | "ios" | "browser";

export interface BetaInstall {
  readonly id: BetaPlatform;
  readonly label: string;
  /** Which address we need, and why it is probably not the one they gave us. */
  readonly accountLabel: string | null;
  readonly accountHint: string | null;
  readonly heading: string;
  readonly steps: readonly string[];
  /** Said before they start waiting, not after they ask. */
  readonly wait: string | null;
}

export const BETA_INSTALL: Record<BetaPlatform, BetaInstall> = {
  android: {
    id: "android",
    label: "Android phone",
    accountLabel: "The email on your Google account",
    /**
     * The single most common reason a tester never finds the build. Play looks
     * up the Google account signed in on the phone, which for a great many
     * people is not the address they use for mail — and the failure is silent:
     * the store simply says the app is not available in their country.
     */
    accountHint:
      "It has to be the Google account signed in on the phone. That is often not the address you gave us, and if they do not match the Play Store will say Plus One is unavailable rather than telling you why.",
    heading: "Getting it on your phone",
    steps: [
      "We add your Google account to the test group.",
      "You get an email from Google Play with a link to join. Open it on the phone you will use.",
      "Tap Become a tester, then Download it on Google Play.",
      "Install Plus One the way you would install anything else.",
    ],
    wait: "Being added takes a day or so. You do not have to wait for it — signing in below works right now in your browser, and it is the same app with the same account.",
  },

  ios: {
    id: "ios",
    label: "iPhone or iPad",
    accountLabel: "The email on your Apple ID",
    accountHint:
      "It has to be the Apple ID signed in on the device. TestFlight sends the invitation to that address and nowhere else.",
    heading: "Getting it on your phone",
    steps: [
      "Install TestFlight from the App Store first. Apple's invitation does nothing without it.",
      "We add your Apple ID to the test group.",
      "Apple emails you an invitation. Open it on the device and it hands you to TestFlight.",
      "Install Plus One from TestFlight.",
    ],
    /**
     * Deliberately vaguer than Android's, and honestly so. An iOS build reaches
     * external testers only after Apple's Beta App Review, which is a queue we
     * do not control and cannot predict — and a promised date we miss is worse
     * than no date. Do not add one here without a reason to believe it.
     */
    wait: "Apple reviews builds before they reach testers, and we cannot predict how long that takes. Signing in below works right now in your browser meanwhile — it is the same app.",
  },

  browser: {
    id: "browser",
    label: "I will just use the browser",
    accountLabel: null,
    accountHint: null,
    heading: "You are already done",
    steps: [
      "Sign in below. That is the whole thing — the app in a browser is the same app.",
      "On a phone, Add to Home Screen gives it an icon and its own window.",
    ],
    /**
     * True, specific, and the reason this option is not a lesser one. iOS only
     * grants web push to a page that was added to the home screen, so on an
     * iPhone that step is the difference between getting a message and never
     * hearing about it — which for a tester is the difference between reporting
     * a bug and never seeing the feature.
     */
    wait: "On an iPhone, Add to Home Screen is also what lets Plus One send you notifications at all — Safari will not deliver them to a tab.",
  },
};

/**
 * The store opt-in links, if we have them.
 *
 * **HELD FOR KEVIN.** Both are read off a console this repo cannot reach:
 *
 *   android  Play Console -> Testing -> Internal testing -> Testers -> the
 *            "Copy link" opt-in URL, of the shape
 *            https://play.google.com/apps/internaltest/<id>
 *   ios      App Store Connect -> TestFlight -> a public link, IF one is
 *            enabled. Individual invitations need no link at all, which is why
 *            this one may legitimately stay null.
 *
 * Null is a supported state and not a broken one: the pages render the steps
 * without a link and say the invitation arrives by email, which is true either
 * way. A link only shortens it.
 *
 * NOT INVENTED. A plausible-looking wrong URL here would send a tester to
 * somebody else's app, and they would have no way to tell that is what happened.
 */
export const BETA_OPT_IN_URL: Record<"android" | "ios", string | null> = {
  android: null,
  ios: null,
};
