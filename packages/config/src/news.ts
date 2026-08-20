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

export const NEWS_SOURCES: readonly NewsSource[] = [
  {
    key: "cdc-newsroom",
    icon: "https://www.cdc.gov/favicon.ico",
    name: "CDC Newsroom",
    feedUrl: "https://tools.cdc.gov/api/v2/resources/media/132608.rss",
    scope: "all",
    // A general newsroom: most of what it publishes is not about this.
    requires: SEXUAL_HEALTH_TERMS,
  },
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
    key: "hiv-gov",
    name: "HIV.gov",
    // The only feed hiv.gov advertises anywhere on the site, and it works.
    //
    // It is a TOPIC feed rather than a news feed — care and lab tests, written
    // once and kept current — so it fills Latest with guidance as well as
    // headlines. That is a fair thing for a member to find there and worth
    // knowing it is what this is.
    feedUrl: "https://www.hiv.gov/provider-visits-and-lab-tests.xml",
    icon: "https://www.hiv.gov/favicon.ico",
    scope: "hiv",
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
] as const;

/**
 * Whether an item from this source should be published.
 *
 * Three questions, and a keyword filter only answers one of them: is the
 * publisher trusted (the allowlist), is the article on topic (`requires`), and
 * is it an article at all (`excludePaths`, and the root check below).
 */
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
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  return source.requires.some((term) => haystack.includes(term));
}

/** Every host the ingest may read from, derived rather than repeated. */
export function newsAllowedHosts(): readonly string[] {
  return [...new Set(NEWS_SOURCES.map((s) => new URL(s.feedUrl).host))];
}
