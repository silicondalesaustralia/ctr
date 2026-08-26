export interface ControlComparisonInput {
  targetBaseline: number;
  targetTreatment: number;
  controlBaseline: number;
  controlTreatment: number;
}

export interface ControlComparisonResult {
  targetImprovement: number;
  controlImprovement: number;
  estimatedTreatmentDifference: number;
}

export function calculateDifferenceInDifferences(
  input: ControlComparisonInput,
): ControlComparisonResult {
  const targetImprovement = input.targetBaseline - input.targetTreatment;
  const controlImprovement = input.controlBaseline - input.controlTreatment;
  return {
    targetImprovement,
    controlImprovement,
    estimatedTreatmentDifference: targetImprovement - controlImprovement,
  };
}
