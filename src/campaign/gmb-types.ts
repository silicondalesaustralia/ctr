export const GMB_ACTIONS = ["open_listing", "website", "directions", "call"] as const;

export type GmbAction = (typeof GMB_ACTIONS)[number];

export interface GmbActionFlags {
  website: boolean;
  directions: boolean;
  call: boolean;
}

export const DEFAULT_GMB_ACTION_FLAGS: GmbActionFlags = {
  website: true,
  directions: true,
  call: true,
};

export function actionsFromFlags(flags: GmbActionFlags): GmbAction[] {
  const actions: GmbAction[] = ["open_listing"];
  if (flags.website) actions.push("website");
  if (flags.directions) actions.push("directions");
  if (flags.call) actions.push("call");
  return actions;
}

export function flagsFromActions(actions: string[] | null | undefined): GmbActionFlags {
  const set = new Set((actions ?? []).map((a) => a.toLowerCase()));
  if (set.size === 0) return { ...DEFAULT_GMB_ACTION_FLAGS };
  return {
    website: set.has("website"),
    directions: set.has("directions"),
    call: set.has("call"),
  };
}

export function parseActionsJson(raw: string | null | undefined): GmbAction[] {
  if (!raw?.trim()) return actionsFromFlags(DEFAULT_GMB_ACTION_FLAGS);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return actionsFromFlags(DEFAULT_GMB_ACTION_FLAGS);
    const allowed = new Set<string>(GMB_ACTIONS);
    const actions = parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.toLowerCase())
      .filter((item): item is GmbAction => allowed.has(item));
    if (!actions.includes("open_listing")) actions.unshift("open_listing");
    return actions.length > 0 ? actions : actionsFromFlags(DEFAULT_GMB_ACTION_FLAGS);
  } catch {
    return actionsFromFlags(DEFAULT_GMB_ACTION_FLAGS);
  }
}

export function serializeActions(actions: GmbAction[]): string {
  return JSON.stringify(actions);
}
