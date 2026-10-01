import type { Page } from "./pw.js";

export interface RankView {
  imageJpeg: Uint8Array<ArrayBuffer>;
  pageUrl: string;
  source?: string;
}

const TITLE_SNIPPET_CHARS = 40;

/** Viewport screenshot with the found result in view; never throws so the session carries on. */
export async function captureRankView(page: Page, title: string, source?: string): Promise<RankView | null> {
  try {
    const snippet = title.replace(/\s+/g, " ").trim().slice(0, TITLE_SNIPPET_CHARS);
    if (snippet.length >= 4) {
      await page
        .getByText(snippet, { exact: false })
        .first()
        .scrollIntoViewIfNeeded({ timeout: 3000 })
        .catch((error: unknown) => {
          console.warn(`[rank-view] could not scroll to result: ${String(error)}`);
        });
      await page.waitForTimeout(400);
    }
    const jpeg = await page.screenshot({ type: "jpeg", quality: 60 });
    return { imageJpeg: new Uint8Array(jpeg), pageUrl: page.url(), source };
  } catch (error) {
    console.warn(`[rank-view] screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
