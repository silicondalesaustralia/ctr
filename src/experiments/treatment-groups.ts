import type { TreatmentGroup } from "@prisma/client";

export const TREATMENT_GROUPS: TreatmentGroup[] = ["search", "direct", "none"];

export function pickTreatmentGroup(
  groups: TreatmentGroup[] = TREATMENT_GROUPS,
  random = Math.random(),
): TreatmentGroup {
  const index = Math.floor(random * groups.length);
  return groups[index] ?? "search";
}
