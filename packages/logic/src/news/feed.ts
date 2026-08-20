/**
 * Reading an RSS or Atom feed, without a dependency for it.
 *
 * Four allowlisted feeds do not justify a parser and its transitive tree — and
 * a parser that accepts anything is the wrong shape here anyway, because the
 * only documents this will ever see are the ones the allowlist names.
 *
 * Pure and string-in, object-out, so it is testable without a network: the
 * fetching lives in the cron route and every decision about what a feed MEANS
 * lives here.
 */

export interface FeedItem {
  readonly title: string;
  readonly url: string;
  readonly summary: string;
  /** Epoch ms, or null when the feed did not say. */
  readonly publishedAt: number | null;
}

/**
 * CDATA, markup and entities — in the order that actually works.
 *
 * Stripping tags and then decoding entities is the obvious order and the wrong
 * one. WHO escapes its summaries, so the feed carries `&lt;p&gt;`: the tag
 * strip finds nothing to remove, the decode turns it into a literal `<p>`, and
 * a member reads markup. The pass runs twice for that reason — once over the
 * markup a feed sends as markup, and once over the markup it sends as text.
 *
 * Script and style go with their CONTENTS. Removing only their tags would leave
 * the code between them sitting in a summary as prose, which is what "the
 * summaries contain js tags" turned out to be.
 */
function stripMarkup(input: string): string {
  return input.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]+>/g, " ");
}

function decodeEntities(input: string): string {
  return (
    input
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      // Last, or it would turn the entities above back into ampersands first.
      .replace(/&amp;/g, "&")
  );
}

function text(raw: string | undefined): string {
  if (!raw) return "";
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return stripMarkup(decodeEntities(stripMarkup(unwrapped)))
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return match?.[1];
}

/**
 * Atom puts the URL in an attribute rather than in the element.
 *
 * A feed may carry several links — the one without a rel, or with
 * rel="alternate", is the article. rel="self" is the feed pointing at itself,
 * and taking that would file every item under one URL and store exactly one.
 */
function atomLink(block: string): string | undefined {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1] ?? "");
  const article =
    links.find((attrs) => /rel=["']alternate["']/i.test(attrs)) ??
    links.find((attrs) => !/rel=/i.test(attrs));
  return /href=["']([^"']+)["']/i.exec(article ?? "")?.[1];
}

function when(block: string): number | null {
  const raw = tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated");
  if (!raw) return null;
  const parsed = Date.parse(text(raw));
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Every item a feed carries, in the order it carries them.
 *
 * Anything without a title or an https URL is dropped rather than repaired: a
 * malformed entry from a trusted source is still malformed, and a guess about
 * what it meant would be published under that source's name.
 */
export function parseFeed(xml: string, limit = 25): FeedItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  const items: FeedItem[] = [];

  for (const block of blocks) {
    const title = text(tag(block, "title"));
    // <link>, then an Atom href, then <guid>.
    //
    // hiv.gov ships no <link> at all and puts the URL in
    // <guid isPermaLink="false">, which is the wrong flag for a value that is
    // plainly a URL — its whole feed was dropped for it. The flag is not worth
    // arguing with: the https:// test below is what decides whether a guid is
    // an address or an opaque id, and an opaque id fails it.
    const url = text(tag(block, "link")) || atomLink(block) || text(tag(block, "guid")) || "";
    if (!title || !url.startsWith("https://")) continue;

    const summary = text(
      tag(block, "description") ?? tag(block, "summary") ?? tag(block, "content"),
    );

    items.push({
      title: title.slice(0, 300),
      url,
      // The column caps this; truncating here means the insert never fails on
      // a long article and quietly loses it.
      summary: summary.slice(0, 1000),
      publishedAt: when(block),
    });

    if (items.length >= limit) break;
  }

  return items;
}
