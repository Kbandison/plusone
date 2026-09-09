/**
 * Where Latest news may come from, and nowhere else.
 *
 * An allowlist rather than a search. Items publish automatically (Kevin's call,
 * 2026-08-20), which makes this the only gate between an outside headline and
 * somebody newly diagnosed — so it is a short list of organisations that
 * publish for a living, not a query that might return anything.
 *
 * EVERY URL HERE WAS FETCHED AND CONFIRMED TO RETURN A FEED. That is not
 * pedantry: an allowlist of dead URLs looks exactly like a working one, right
 * up until a member opens an empty page.
 *
 * NOT ON THE LIST, and worth knowing why:
 *   · aidsmap — no feed. Every path returns 404 or 500 and the site advertises
 *     none in its own markup. There is nothing to subscribe to.
 *   · POZ and Terrence Higgins Trust — 403 to an automated fetch, and still 403
 *     with an honest bot user-agent naming this app. That is CDN bot protection
 *     rather than a user-agent filter, so the only way through is to impersonate
 *     a browser well enough to defeat it. That is not a technical obstacle to
 *     work around, it is the publisher saying no.
 *
 * hiv.gov was on that list and is not any more: the one feed it advertises does
 * work, and is now below.
 *
 * THE SOURCES ARE CLAUDE'S SUGGESTION. Kevin has not reviewed this list, and
 * what a health community points its members at is his call, not mine. The
 * admin screen can remove anything this brings in; adding a source is a change
 * here.
 */

export type NewsScope = "all" | "hsv" | "hiv";

export interface NewsSource {
  /** Stable id, stored on every item so a source can be traced or removed. */
  readonly key: string;
  /** Shown to members, so they can see where something came from before opening it. */
  readonly name: string;
  readonly feedUrl: string;
  readonly scope: NewsScope;
  /**
   * An item is kept only if its title or summary contains one of these.
   *
   * A source-level allowlist says the publisher is trustworthy. It does not say
   * the article is relevant — CDC's newsroom carries kindergarten vaccination
   * figures, and a member opening "Latest news" in a room about their diagnosis
   * should not find those. Absent means the whole feed is on topic.
   */
  readonly requires?: readonly string[];
  /**
   * Path prefixes that are not articles.
   *
   * Several feeds carry their own furniture as items — a site root, an About
   * page, one entry per author. Every one of those passes a keyword filter
   * ("About TheBody, the Essential HIV/AIDS Community" contains HIV) and none
   * of them is news. Publishing on arrival means this has to be caught before
   * a member sees "Myles Helfand" in Latest.
   */
  readonly excludePaths?: readonly string[];
  /**
   * The publisher's mark, shown where a member's photograph would be.
   *
   * Hotlinked rather than copied, and rendered with referrerPolicy="no-referrer"
   * — otherwise fetching it tells the publisher's server that somebody in a
   * health community is looking at their article, which is the visit we take
   * care not to hand over on the link itself.
   */
  readonly icon?: string;
}

/**
 * Terms that make a general-interest item relevant here.
 *
 * Deliberately narrow and deliberately clinical: these match article text and
 * never appear in a URL, a notification or an analytics event, which is what §8
 * constrains.
 */
const SEXUAL_HEALTH_TERMS = [
  "hiv",
  "aids",
  "herpes",
  "hsv",
  "sti",
  "std",
  "sexually transmitted",
  "sexual health",
  "prep",
  "u=u",
  "undetectable",
] as const;

/**
 * TWO SOURCES WERE REMOVED HERE ON 2026-09-09, AND NOT FOR BEING QUIET.
 *
 * Both were fetched live and both answered 200 with content nobody had touched
 * in years — so they parsed cleanly, deduplicated to nothing, and reported a
 * healthy run every six hours while the room sat still:
 *
 *   cdc-newsroom  tools.cdc.gov/.../132608.rss   newest item Nov 2015
 *   hiv-gov       hiv.gov/provider-visits...xml  newest item Jun 2023
 *
 * Neither URL is a newsroom. One is a static media resource and the other a
 * page-specific topic feed, and both were presumably right when chosen. Do not
 * put them back without fetching them first: every CDC newsroom id tried as a
 * replacement was also stale (2018, 2020), and hiv.gov advertises no working
 * news feed at all.
 *
 * The cron reports `stale` per source now, so the next one to freeze says so
 * rather than looking like a slow news week.
 */
export const NEWS_SOURCES: readonly NewsSource[] = [
  {
    key: "asha",
    icon: "https://www.ashasexualhealth.org/wp-content/uploads/2020/02/site_icon.jpg",
    name: "American Sexual Health Association",
    feedUrl: "https://www.ashasexualhealth.org/feed/",
    scope: "all",
    requires: SEXUAL_HEALTH_TERMS,
  },
  {
    key: "who",
    icon: "https://www.who.int/favicon.ico",
    name: "World Health Organization",
    feedUrl: "https://www.who.int/rss-feeds/news-english.xml",
    scope: "all",
    requires: SEXUAL_HEALTH_TERMS,
  },
  {
    key: "thebody",
    icon: "https://www.thebody.com/favicon-512.png",
    name: "TheBody",
    feedUrl: "https://www.thebody.com/feed",
    // An HIV publication, so the whole feed is on topic — but it is scoped to
    // the community it serves rather than shown to everybody.
    scope: "hiv",
    // Its feed lists sections and contributors alongside articles.
    excludePaths: ["/about", "/author/", "/news-scan", "/contact", "/privacy", "/terms"],
  },
  {
    key: "thebodypro",
    icon: "https://www.thebodypro.com/favicon-512.png",
    name: "TheBodyPro",
    feedUrl: "https://www.thebodypro.com/feed",
    /**
     * TheBody's clinical sibling: 50 items, 38 on subject, current.
     *
     * Nearly discarded on a measurement of my own that was wrong — `grep -c`
     * counts matching LINES, and this feed is minified onto one, so it read as
     * "1 item". Both it and thebody.com were dismissed on that number before
     * anybody looked at the bytes.
     *
     * Scoped to the community it serves, like thebody.com, rather than shown to
     * everybody.
     */
    scope: "hiv",
    excludePaths: ["/about", "/author/", "/contact", "/privacy", "/terms"],
  },
  /**
   * ScienceDaily's topic feeds — three, and `scope: "all"` on purpose.
   *
   * Each is live and current: 60 items apiece, newest the same day, measured
   * rather than assumed. They are the only maintained on-subject feeds found;
   * POZ, aidsmap, UNAIDS, NIAID, Medical News Today and ContagionLive all
   * refuse a non-browser agent or 404 on every documented path.
   *
   * ── why "all" rather than the topic's own scope ─────────────────────────
   *
   * Their tagging is LOOSE. The herpes feed leads with a tuberculosis vaccine
   * and the HIV one with measles — science headlines brushed against a topic,
   * not condition reporting. Trusting `herpes.xml` to mean HSV would put an HIV
   * article in the HSV room on ScienceDaily's say-so, which is the exact failure
   * per-article routing exists to stop. So they arrive general, `requires`
   * discards what is off subject, and `articleScope` decides who each surviving
   * article is for.
   *
   * ── why three, not one or four ──────────────────────────────────────────
   *
   * Measured overlap of the on-topic items: std alone 31, adding HIV reaches 47,
   * adding herpes reaches 65. A fourth (sexual_health) added six. Duplicates
   * across them cost nothing — the upsert conflicts on (room_id, article_url).
   */
  {
    key: "sciencedaily-std",
    name: "ScienceDaily",
    icon: "https://www.sciencedaily.com/favicon.ico",
    feedUrl: "https://www.sciencedaily.com/rss/health_medicine/std.xml",
    scope: "all",
    requires: SEXUAL_HEALTH_TERMS,
  },
  {
    key: "sciencedaily-hiv",
    name: "ScienceDaily",
    icon: "https://www.sciencedaily.com/favicon.ico",
    feedUrl: "https://www.sciencedaily.com/rss/health_medicine/hiv_and_aids.xml",
    scope: "all",
    requires: SEXUAL_HEALTH_TERMS,
  },
  {
    key: "sciencedaily-herpes",
    name: "ScienceDaily",
    icon: "https://www.sciencedaily.com/favicon.ico",
    feedUrl: "https://www.sciencedaily.com/rss/health_medicine/herpes.xml",
    scope: "all",
    requires: SEXUAL_HEALTH_TERMS,
  },
] as const;

/**
 * Whether an item from this source should be published.
 *
 * Three questions, and a keyword filter only answers one of them: is the
 * publisher trusted (the allowlist), is the article on topic (`requires`), and
 * is it an article at all (`excludePaths`, and the root check below).
 */
/**
 * Terms that make an article about ONE community rather than both.
 *
 * The scope on a SOURCE says who its feed is for. It cannot say who a given
 * article is for, and three of the five sources are general sexual-health
 * publishers whose articles land in every room — so an HIV-only piece from the
 * CDC reached somebody who has herpes, which is the thing this app exists not
 * to do.
 *
 * Deliberately short and deliberately specific. A long list of clever synonyms
 * would misfile more than it filed: the cost of a wrong answer here is a member
 * being shown an article about a condition they do not have, on a screen whose
 * whole promise is that they are among people who share theirs.
 *
 * "prep" and "u=u" are HIV terms and belong here rather than in the shared list
 * above, where they were only ever doing relevance filtering.
 */
const HIV_ONLY_TERMS = ["hiv", "aids", "antiretroviral", "prep", "u=u", "undetectable"] as const;
const HSV_ONLY_TERMS = ["herpes", "hsv", "cold sore", "genital sores", "valacyclovir"] as const;

/**
 * Which communities an article from an `all` source belongs to.
 *
 * Mentions one and not the other → that one. Mentions BOTH, or neither → both,
 * which is the safe default in two different ways: an article covering both is
 * exactly what Kevin asked to keep, and a general STI piece belongs everywhere
 * rather than nowhere.
 *
 * Returns null for "no restriction", so a caller can tell "goes everywhere"
 * apart from "goes to this specific list" without a sentinel.
 */
export function articleScope(item: {
  readonly title: string;
  readonly summary: string;
}): NewsScope | null {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  const hiv = HIV_ONLY_TERMS.some((t) => haystack.includes(t));
  const hsv = HSV_ONLY_TERMS.some((t) => haystack.includes(t));
  if (hiv && !hsv) return "hiv";
  if (hsv && !hiv) return "hsv";
  return null;
}

/**
 * Whole words, not substrings — and this was a real bug, not a tidy-up.
 *
 * The check was `haystack.includes(term)`, and the list holds three-letter
 * acronyms. "sti" is inside PREstigious, teSTIng, exiSTIng, inveSTIgation and
 * stiLL; "prep" is inside PREParation; "aids" is inside a surprising number of
 * proper nouns. So a general newsroom's entire output looked on topic: a STAT
 * News item headlined "Orexin discoverers awarded prestigious Lasker award"
 * passed the sexual-health filter, and so did an AstraZeneca breast cancer
 * story.
 *
 * Found while measuring candidate feeds — the yields looked implausibly high
 * and the first three "on topic" headlines were about oncology and research
 * funding. It had been quietly widening every `requires` source since the
 * filter was written.
 *
 * Boundaries are non-alphanumeric rather than \b so "u=u" survives: \b would
 * not fire either side of an equals sign. Terms are escaped because "u=u" and
 * any future one with punctuation are data, not patterns.
 */
function matchesAnyTerm(text: string, terms: readonly string[]): boolean {
  const haystack = text.toLowerCase();
  return terms.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
  });
}

export function shouldPublishNews(
  source: NewsSource,
  item: { readonly title: string; readonly summary: string; readonly url: string },
): boolean {
  let path: string;
  try {
    path = new URL(item.url).pathname;
  } catch {
    return false;
  }

  // A link to the site itself is never an article, whatever it is titled.
  if (path === "" || path === "/") return false;
  if ((source.excludePaths ?? []).some((prefix) => path.startsWith(prefix))) return false;

  if (!source.requires) return true;
  return matchesAnyTerm(`${item.title} ${item.summary}`, source.requires);
}

/** Every host the ingest may read from, derived rather than repeated. */
export function newsAllowedHosts(): readonly string[] {
  return [...new Set(NEWS_SOURCES.map((s) => new URL(s.feedUrl).host))];
}
