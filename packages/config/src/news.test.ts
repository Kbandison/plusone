import { describe, expect, it } from "vitest";

import { NEWS_SOURCES, newsAllowedHosts, shouldPublishNews, articleScope } from "./news";

const source = NEWS_SOURCES.find((s) => s.key === "thebody")!;
const cdc = NEWS_SOURCES.find((s) => s.key === "cdc-newsroom")!;

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
    expect(cdc.requires).toBeDefined();
    expect(
      shouldPublishNews(cdc, {
        title: "CDC Statement on Newly Released Kindergarten Vaccination Data",
        summary: "",
        url: "https://tools.cdc.gov/x/1",
      }),
    ).toBe(false);
    expect(
      shouldPublishNews(cdc, {
        title: "New STI treatment guidelines",
        summary: "",
        url: "https://tools.cdc.gov/x/2",
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
