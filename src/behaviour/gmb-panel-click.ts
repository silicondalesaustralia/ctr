import type { Page } from "../browser/pw.js";
import { trustedClickPicked } from "../browser/serp-trusted-click.js";

export interface PanelClick {
  clicked: boolean;
  /** href of the clicked control, so a link the tap didn't open can be followed directly. */
  href: string | null;
}

/**
 * Click an action control inside the target business's panel only. Maps keeps
 * the results feed beside the open listing, and every competitor card there has
 * its own Website / Directions / phone controls.
 */
export async function clickByLabels(
  page: Page,
  labels: string[],
  precise: string,
  businessName: string,
): Promise<PanelClick> {
  const handle = await page.evaluateHandle(({ needles, preciseSelector, name }): HTMLElement | null => {
    const lowered = needles.map((n) => n.toLowerCase());
    const target = name.toLowerCase();
    const panels = Array.from(document.querySelectorAll("[role='main'][aria-label]")) as HTMLElement[];
    const panel =
      panels.find((el) => (el.getAttribute("aria-label") ?? "").toLowerCase().includes(target)) ??
      panels.find((el) => (el.getAttribute("aria-label") ?? "").toLowerCase().startsWith(target.slice(0, 12))) ??
      // The phone SERP's /searchviewer/ profile shows one business with no named panel.
      (location.pathname.startsWith("/searchviewer/") ? document.body : null);
    if (!panel) return null;

    const preciseHit = Array.from(panel.querySelectorAll(preciseSelector)).find(
      (el) => !el.closest("[role='feed'], [role='article']"),
    ) as HTMLElement | undefined;
    if (preciseHit) {
      preciseHit.scrollIntoView({ block: "center", inline: "nearest" });
      return preciseHit;
    }

    const candidates = (
      Array.from(
        panel.querySelectorAll("a, button, [role='button'], [role='link'], [data-value], [aria-label]"),
      ) as HTMLElement[]
    ).filter((el) => !el.closest("[role='feed'], [role='article']"));

    for (const el of candidates) {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
      const dataValue = (el.getAttribute("data-value") ?? "").toLowerCase();
      const haystack = `${text} ${aria} ${dataValue}`;
      if (!lowered.some((needle) => haystack.includes(needle))) continue;

      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (
        style.visibility === "hidden" ||
        style.display === "none" ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        continue;
      }
      el.scrollIntoView({ block: "center", inline: "nearest" });
      return el;
    }
    return null;
  }, { needles: labels, preciseSelector: precise, name: businessName });
  const element = handle.asElement();
  const href = element
    ? await element.evaluate((el) => (el instanceof HTMLAnchorElement && el.href ? el.href : null)).catch(() => null)
    : null;
  const clicked = (await trustedClickPicked(page, element, "gmb-action")) !== null;
  return { clicked, href };
}
