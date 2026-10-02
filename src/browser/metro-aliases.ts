/** Geo-IP city names that fall inside a target metro (Greater Capital City areas). */
const METRO_ALIASES: Record<string, readonly string[]> = {
  sydney: ["centralcoast", "gosford", "parramatta", "penrith", "blacktown", "liverpool", "campbelltown", "northsydney", "chatswood"],
  melbourne: ["dandenong", "frankston", "ringwood", "footscray", "sunshine", "boxhill"],
  brisbane: ["ipswich", "logan", "logancity", "redcliffe", "moretonbay"],
  adelaide: ["adelaidehills", "mountbarker", "salisbury", "elizabeth", "glenelg"],
  perth: ["fremantle", "joondalup", "rockingham", "midland"],
  auckland: ["manukau", "northshore", "waitakere", "papakura"],
  newyork: ["newyorkcity", "brooklyn", "queens", "bronx", "statenisland", "manhattan", "jerseycity", "newark", "yonkers"],
  losangeles: ["longbeach", "santamonica", "pasadena", "glendale", "burbank", "inglewood", "anaheim", "torrance"],
  chicago: ["evanston", "oakpark", "cicero", "naperville", "schaumburg"],
  houston: ["pasadena", "sugarland", "katy", "pearland", "thewoodlands"],
  washington: ["arlington", "alexandria", "bethesda", "silverspring"],
  toronto: ["mississauga", "brampton", "markham", "vaughan", "scarborough", "northyork", "etobicoke"],
  montreal: ["laval", "longueuil"],
  vancouver: ["burnaby", "surrey", "richmond", "coquitlam", "northvancouver"],
  london: ["cityoflondon", "westminster", "croydon", "camden", "islington", "hackney", "southwark", "lambeth", "ealing", "enfield"],
  manchester: ["salford", "stockport", "oldham", "bolton", "trafford"],
  birmingham: ["solihull", "wolverhampton", "walsall", "dudley", "westbromwich"],
  dublin: ["dunlaoghaire", "swords", "tallaght", "blanchardstown"],
  paris: ["boulognebillancourt", "saintdenis", "montreuil", "nanterre", "versailles"],
  amsterdam: ["amstelveen", "zaandam", "haarlem"],
  delhi: ["newdelhi", "noida", "gurgaon", "gurugram", "ghaziabad", "faridabad"],
  mumbai: ["navimumbai", "thane"],
  bengaluru: ["bangalore"],
  johannesburg: ["sandton", "randburg", "soweto", "midrand"],
};

/** Both arguments must already be normalised with normalizeCityName. */
export function isSameMetro(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  return METRO_ALIASES[expected]?.includes(actual) ?? false;
}
