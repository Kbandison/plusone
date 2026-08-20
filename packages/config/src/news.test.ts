import { describe, expect, it } from "vitest";

import { NEWS_SOURCES, newsAllowedHosts, shouldPublishNews } from "./news";

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
