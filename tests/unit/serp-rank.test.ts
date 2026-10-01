import { describe, expect, it } from "vitest";
import type { Page } from "../../src/browser/pw.js";
import { findTargetOnCurrentPage } from "../../src/browser/serp-parser.js";

interface Link {
  href: string;
  title: string;
  displayedUrl: string;
}

function link(domain: string, n: number): Link {
  return { href: `https://${domain}/page-${n}`, title: `Result ${domain} ${n}`, displayedUrl: `https://${domain}` };
}

function fakePage(links: Link[]): Page {
  const page = {
    waitForLoadState: async () => undefined,
    evaluate: async () => links,
  };
  return page as unknown as Page;
}

const pageOne = Array.from({ length: 9 }, (_, i) => link(`site${i}.com.au`, i));

describe("findTargetOnCurrentPage rank", () => {
  it("counts the real number of results on earlier pages", async () => {
    const counted = new Set<string>();
    expect(await findTargetOnCurrentPage(fakePage(pageOne), "target.com.au", 1, counted)).toBeNull();

    const pageTwo = [link("other.com.au", 1), link("other.com.au", 2), link("target.com.au", 1)];
    const result = await findTargetOnCurrentPage(fakePage(pageTwo), "target.com.au", 2, counted);
    expect(result?.position).toBe(3);
    expect(result?.rank).toBe(12);
  });

  it("does not re-count results kept in the DOM by continuous scroll", async () => {
    const counted = new Set<string>();
    await findTargetOnCurrentPage(fakePage(pageOne), "target.com.au", 1, counted);

    const batch = [...pageOne, link("other.com.au", 1), link("target.com.au", 1)];
    const result = await findTargetOnCurrentPage(fakePage(batch), "target.com.au", 2, counted);
    expect(result?.position).toBe(2);
    expect(result?.rank).toBe(11);
  });

  it("ranks from 1 when no earlier pages were counted", async () => {
    const result = await findTargetOnCurrentPage(fakePage([link("target.com.au", 1)]), "target.com.au", 1);
    expect(result?.rank).toBe(1);
  });
});
