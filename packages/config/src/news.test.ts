import { describe, expect, it } from "vitest";

import { NEWS_SOURCES, newsAllowedHosts, shouldPublishNews, articleScope } from "./news";

const source = NEWS_SOURCES.find((s) => s.key === "thebody")!;
/**
 * A general-interest source, for the topic filter.
 *
 * Was cdc-newsroom, retired on 2026-09-09 with its feed eleven years stale.
 * ScienceDaily is the same shape and the reason the filter matters more now:
 * its topic feeds lead with tuberculosis vaccines and measles.
 */
const general = NEWS_SOURCES.find((s) => s.key === "sciencedaily-std")!;

describe("the allowlist", () => {
  /** An allowlist of dead URLs looks exactly like a working one. */
  it("is https, and every feed lives on a host the ingest may read", () => {
    const hosts = new Set(newsAllowedHosts());
    for (const s of NEWS_SOURCES) {
      expect(s.feedUrl.startsWith("https://"), s.key).toBe(true);
      expect(hosts.has(new URL(s.feedUrl).host), s.key).toBe(true);
    }
  });

  it("gives every source a stable key and a name a member can read", () => {
    const keys = NEWS_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of NEWS_SOURCES) expect(s.name.length).toBeGreaterThan(2);
  });

  /**
   * A general newsroom publishes mostly other things. Without this, "Latest"
   * in a room about somebody's diagnosis carries kindergarten vaccination
   * figures.
   */
  it("filters a general-interest source by topic", () => {
    expect(general.requires).toBeDefined();
    expect(
      shouldPublishNews(general, {
        title: "Johns Hopkins scientists develop nose spray DNA vaccine for tuberculosis",
        summary: "",
        url: "https://www.sciencedaily.com/releases/x/1.htm",
      }),
    ).toBe(false);
    expect(
      shouldPublishNews(general, {
        title: "New STI treatment guidelines",
        summary: "",
        url: "https://tools.general.gov/x/2",
      }),
    ).toBe(true);
  });
});

/**
 * Several feeds carry their own furniture as items — a site root, an About
 * page, one entry per author. Every one passes a keyword filter and none is
 * news; publishing on arrival means catching them before a member does.
 */
describe("what is not an article", () => {
  it("drops a link to the site itself", () => {
    expect(
      shouldPublishNews(source, {
        title: "TheBody: The HIV/AIDS Resource",
        summary: "",
        url: "https://www.thebody.com/",
      }),
    ).toBe(false);
  });

  it("drops the pages a feed lists beside its articles", () => {
    for (const url of [
      "https://www.thebody.com/about",
      "https://www.thebody.com/author/myles-helfand",
      "https://www.thebody.com/news-scan",
    ]) {
      expect(shouldPublishNews(source, { title: "HIV", summary: "", url }), url).toBe(false);
    }
  });

  it("keeps an actual article", () => {
    expect(
      shouldPublishNews(source, {
        title: "Can We Teach the Immune System to Control HIV on Its Own?",
        summary: "",
        url: "https://www.thebody.com/article/immune-system-control-hiv",
      }),
    ).toBe(true);
  });

  /** A malformed URL is not an article either, and must not throw. */
  it("refuses something that is not a URL", () => {
    expect(shouldPublishNews(source, { title: "x", summary: "", url: "not a url" })).toBe(false);
  });
});

describe("an article reaches the community it is actually about", () => {
  const item = (title: string, summary = "") => ({ title, summary });

  it("sends an HIV-only piece to the HIV room alone", () => {
    // The failure this exists for: three of the five sources are general
    // sexual-health publishers scoped `all`, so every article they ran went
    // into every room — an HIV-only piece reached somebody who has herpes, on a
    // screen whose promise is that they are among people who share theirs.
    expect(articleScope(item("New PrEP guidance for clinicians"))).toBe("hiv");
    expect(articleScope(item("Undetectable equals untransmittable, ten years on"))).toBe("hiv");
  });

  it("sends an HSV-only piece to the HSV room alone", () => {
    expect(articleScope(item("Managing herpes: the science and the feelings"))).toBe("hsv");
    expect(articleScope(item("Valacyclovir and suppression"))).toBe("hsv");
  });

  it("sends a piece covering BOTH to both rooms", () => {
    // Kevin's exception, and the reason this returns null rather than picking a
    // winner: an article that refers to both is exactly the one to keep in both.
    expect(articleScope(item("HIV and herpes co-infection: what the data says"))).toBeNull();
  });

  it("sends a general piece to both rooms rather than neither", () => {
    // The other half of the safe default. A bacterial-vaginosis or general STI
    // article names neither condition and belongs in both rooms — dropping it
    // would make the filter quietly empty the feed.
    expect(articleScope(item("Bacterial vaginosis and STIs often happen together"))).toBeNull();
    expect(articleScope(item("CDC guidance on sexually transmitted ringworm"))).toBeNull();
  });

  it("reads the summary, not only the headline", () => {
    // A headline is often coy about which condition it means.
    expect(articleScope(item("New guidance", "The CDC has updated its HIV testing advice."))).toBe(
      "hiv",
    );
  });

  it("is case-insensitive", () => {
    expect(articleScope(item("HERPES simplex in adults"))).toBe("hsv");
  });
});

describe("every source is a live feed on an allowed host", () => {
  it("names every feed over https", () => {
    // The assertion here WAS "every source's host is allowlisted", which cannot
    // fail: newsAllowedHosts() is derived from NEWS_SOURCES by mapping their
    // hosts, so it is true by construction. A sabotage that added a source on
    // example.com passed happily, which is how it was found.
    //
    // This is a property the list can actually violate. The cron refuses
    // redirects, so an http feed does not silently upgrade — it just fails.
    for (const s of NEWS_SOURCES) {
      expect(new URL(s.feedUrl).protocol, `${s.key} is not https`).toBe("https:");
    }
  });

  it("keeps no source that was retired for being stale", () => {
    // Both answered 200 with content years old, which is why they were removed
    // rather than left to look like a quiet week. Re-adding either without
    // fetching it first is the mistake this guards.
    const urls = NEWS_SOURCES.map((s) => s.feedUrl).join(" ");
    expect(urls).not.toContain("132608.rss");
    expect(urls).not.toContain("provider-visits-and-lab-tests");
  });

  it("gives a loosely-tagged topic feed `all` and a relevance filter", () => {
    // ScienceDaily's herpes feed leads with tuberculosis. Trusting its tag
    // would put an HIV article in the HSV room on its say-so — so these arrive
    // general and articleScope decides, which is the whole point of that
    // function existing.
    for (const s of NEWS_SOURCES.filter((x) => x.key.startsWith("sciencedaily"))) {
      expect(s.scope, `${s.key} trusts its own tag`).toBe("all");
      expect(s.requires, `${s.key} has no relevance filter`).toBeDefined();
    }
  });

  it("still has a source scoped to each community", () => {
    // The floor under the change above: making everything `all` would be one
    // way to pass the previous assertion and would leave no feed chosen FOR a
    // community.
    expect(NEWS_SOURCES.some((s) => s.scope === "hiv")).toBe(true);
  });
});

describe("the relevance filter matches words, not fragments", () => {
  const general = NEWS_SOURCES.find((s) => s.key === "sciencedaily-std")!;
  const pub = (title: string) =>
    shouldPublishNews(general, { title, summary: "", url: "https://www.sciencedaily.com/a/1.htm" });

  it("does not let 'sti' through inside an ordinary word", () => {
    // The bug this replaced: `includes("sti")` matched PREstigious, teSTIng,
    // exiSTIng and inveSTIgation, so a general newsroom's whole output looked on
    // topic. Found by measuring candidate feeds and reading the headlines that
    // "passed" — oncology and research funding.
    for (const title of [
      "Orexin discoverers awarded prestigious Lasker award",
      "Existing drugs show promise in testing",
      "Investigation into hospital staffing",
    ]) {
      expect(pub(title), `let through: ${title}`).toBe(false);
    }
  });

  it("does not let 'prep' through inside 'preparation'", () => {
    expect(pub("Preparation of the new vaccine batch")).toBe(false);
  });

  it("still passes the real thing", () => {
    for (const title of [
      "New STI guidance for clinicians",
      "PrEP uptake rises among young adults",
      "Herpes simplex research update",
      "HIV and STD screening in primary care",
    ]) {
      expect(pub(title), `blocked: ${title}`).toBe(true);
    }
  });

  it("keeps a term that contains punctuation working", () => {
    // u=u would not survive a \b boundary on either side of the equals sign,
    // which is why the boundary is "not alphanumeric" rather than \b.
    expect(pub("Ten years of U=U")).toBe(true);
  });
});
