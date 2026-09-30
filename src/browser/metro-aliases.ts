/** Geo-IP city names that fall inside a target metro (Greater Capital City areas). */
const METRO_ALIASES: Record<string, readonly string[]> = {
  sydney: ["centralcoast", "gosford", "parramatta", "penrith", "blacktown", "liverpool", "campbelltown", "northsydney", "chatswood"],
  melbourne: ["dandenong", "frankston", "ringwood", "footscray", "sunshine", "boxhill"],
  brisbane: ["ipswich", "logan", "logancity", "redcliffe", "moretonbay"],
  adelaide: ["adelaidehills", "mountbarker", "salisbury", "elizabeth", "glenelg"],
  perth: ["fremantle", "joondalup", "rockingham", "midland"],
};

/** Both arguments must already be normalised with normalizeCityName. */
export function isSameMetro(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  return METRO_ALIASES[expected]?.includes(actual) ?? false;
}
