import { describe, expect, it } from "vitest";

import { parseFeed } from "./feed";

const rss = `<?xml version="1.0"?><rss><channel>
  <title>A feed</title>
  <item>
    <title><![CDATA[Something &amp; something]]></title>
    <link>https://example.org/one</link>
    <description><![CDATA[<p>A summary with <b>markup</b> in it.</p>]]></description>
    <pubDate>Wed, 19 Aug 2026 09:00:00 GMT</pubDate>
  </item>
  <item>
    <title>No link here</title>
    <description>Dropped</description>
  </item>
  <item>
    <title>Insecure</title>
    <link>http://example.org/two</link>
  </item>
</channel></rss>`;

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="https://example.org/feed"/>
  <entry>
    <title>An entry</title>
    <link rel="self" href="https://example.org/feed"/>
    <link rel="alternate" href="https://example.org/article"/>
    <summary>Short.</summary>
    <published>2026-08-18T10:00:00Z</published>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("reads an RSS item", () => {
    const [first] = parseFeed(rss);
    expect(first?.title).toBe("Something & something");
    expect(first?.url).toBe("https://example.org/one");
    expect(first?.publishedAt).toBe(Date.parse("2026-08-19T09:00:00Z"));
  });

  /** A summary is prose, not markup — it renders as text. */
  it("strips tags and CDATA out of a summary", () => {
    expect(parseFeed(rss)[0]?.summary).toBe("A summary with markup in it.");
  });

  /**
   * A malformed entry from a trusted source is still malformed, and a guess
   * about what it meant would be published under that source's name.
   */
  it("drops an item with no link, and one that is not https", () => {
    const urls = parseFeed(rss).map((i) => i.url);
    expect(urls).toEqual(["https://example.org/one"]);
  });

  /**
   * rel="self" is the feed pointing at itself. Taking it would file every item
   * under one URL, and the unique index would store exactly one of them.
   */
  it("takes the article link from an Atom entry, not the feed's own", () => {
    const [entry] = parseFeed(atom);
    expect(entry?.url).toBe("https://example.org/article");
    expect(entry?.publishedAt).toBe(Date.parse("2026-08-18T10:00:00Z"));
  });

  it("says null rather than guessing when there is no date", () => {
    const undated = parseFeed(
      `<rss><item><title>x</title><link>https://a.example/x</link></item></rss>`,
    );
    expect(undated[0]?.publishedAt).toBeNull();
  });

  /** The columns cap these; truncating here means the insert never fails. */
  it("bounds the title and the summary", () => {
    const long = `<rss><item><title>${"t".repeat(400)}</title><link>https://a.example/x</link><description>${"s".repeat(1400)}</description></item></rss>`;
    const [item] = parseFeed(long);
    expect(item?.title).toHaveLength(300);
    expect(item?.summary).toHaveLength(1000);
  });

  it("takes no more than it was asked for", () => {
    const many = `<rss>${Array.from({ length: 40 }, (_, i) => `<item><title>t${i}</title><link>https://a.example/${i}</link></item>`).join("")}</rss>`;
    expect(parseFeed(many, 5)).toHaveLength(5);
  });

  it("returns nothing for something that is not a feed", () => {
    expect(parseFeed("<html><body>not a feed</body></html>")).toEqual([]);
  });
});

/**
 * Stripping tags and then decoding entities is the obvious order and the wrong
 * one: WHO escapes its summaries, so the feed carries `&lt;p&gt;` — the strip
 * finds nothing, the decode makes a literal `<p>`, and a member reads markup.
 */
describe("markup a feed sends as text", () => {
  it("removes escaped tags as well as real ones", () => {
    const xml = `<rss><item><title>t</title><link>https://a.example/x</link>
      <description>&lt;p&gt;Real prose here.&lt;/p&gt;</description></item></rss>`;
    expect(parseFeed(xml)[0]?.summary).toBe("Real prose here.");
  });

  /**
   * Removing only the tags would leave the code between them sitting in a
   * summary as prose — which is what "the summaries contain js tags" was.
   */
  it("removes script and style with their contents", () => {
    const xml = `<rss><item><title>t</title><link>https://a.example/x</link>
      <description><![CDATA[<script>var x = 1; window.y();</script><p>Kept.</p><style>.a{color:red}</style>]]></description></item></rss>`;
    expect(parseFeed(xml)[0]?.summary).toBe("Kept.");
  });

  it("handles them escaped too", () => {
    const xml = `<rss><item><title>t</title><link>https://a.example/x</link>
      <description>&lt;script&gt;alert(1)&lt;/script&gt;Kept.</description></item></rss>`;
    expect(parseFeed(xml)[0]?.summary).toBe("Kept.");
  });

  it("decodes numeric entities", () => {
    const xml = `<rss><item><title>Caf&#233; &amp; more</title><link>https://a.example/x</link></item></rss>`;
    expect(parseFeed(xml)[0]?.title).toBe("Café & more");
  });
});
