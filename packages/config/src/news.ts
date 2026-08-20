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
 *   · aidsmap and hiv.gov — every feed path tried returned 404. They may have
 *     moved; the old ones are not usable.
 *   · POZ and Terrence Higgins Trust — both answer an automated fetch with 403.
 *     Fetching them anyway would mean pretending to be a browser, which is a
 *     thing to decide on purpose rather than slip into.
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
    name: "CDC Newsroom",
    feedUrl: "https://tools.cdc.gov/api/v2/resources/media/132608.rss",
    scope: "all",
    // A general newsroom: most of what it publishes is not about this.
    requires: SEXUAL_HEALTH_TERMS,
  },
  {
    key: "asha",
    name: "American Sexual Health Association",
    feedUrl: "https://www.ashasexualhealth.org/feed/",
    scope: "all",
    requires: SEXUAL_HEALTH_TERMS,
  },
  {
    key: "who",
    name: "World Health Organization",
    feedUrl: "https://www.who.int/rss-feeds/news-english.xml",
    scope: "all",
    requires: SEXUAL_HEALTH_TERMS,
  },
  {
    key: "thebody",
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
