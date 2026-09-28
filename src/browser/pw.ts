/**
 * Automation client facade — playwright-core pinned to the version camoufox-js drives.
 * Chromium is used only for legacy GoLogin/Orbita CDP; Camoufox (Firefox) is the default.
 * Keep this as the only import site for browser runtime APIs.
 */
export { chromium, firefox } from "playwright-core";
export type { Browser, BrowserContext, Page, Response } from "playwright-core";
