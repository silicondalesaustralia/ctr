/**
 * SERP features that are not organic results. Anchors inside these never get an
 * organic position, so the first counted result is the first true web result.
 */
export const NON_ORGANIC_CONTAINER_SELECTOR = [
  // Ads (top, bottom, text ads)
  "#tads", "#tadsb", "#bottomads", "[data-text-ad]", "[aria-label='Ads']", ".uEierd",
  // Map pack / local results
  "[data-local-attribute]", ".VkpGBb", "[jscontroller='AtSb']", "g-more-link",
  // Shopping / product units
  ".commercial-unit-desktop-top", ".commercial-unit-desktop-rhs", ".cu-container",
  ".pla-unit", "[data-pla]", "product-viewer-group",
  // People also ask (expanded answers contain h3 result links)
  ".related-question-pair", "[data-initq]", "[jsname='Cpkphb']",
  // Carousels: top stories, videos, short videos, tweets, images
  "g-scrolling-carousel", "g-section-with-header", "video-voyager", "inline-video",
  "#iur", "#imagebox_bigimages",
  // Knowledge panel, related searches
  "#rhs", "#botstuff", "#bres",
].join(", ");

/** Section headings (English) that introduce non-organic blocks. */
export const NON_ORGANIC_HEADING_PATTERN =
  "^(sponsored|ads?|places|businesses|local results|map|shopping|popular products|products|deals|" +
  "people also ask|top stories|news|videos|short videos|images|discussions and forums|" +
  "perspectives|things to know|people also search for|related searches|what people are saying)\\b";

export function isNonOrganicHeading(text: string): boolean {
  return new RegExp(NON_ORGANIC_HEADING_PATTERN, "i").test(text.replace(/\s+/g, " ").trim());
}
