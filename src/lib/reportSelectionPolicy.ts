export type SnapshotOccupancyType = "owner_occupied" | "investment" | "tenant";
export type SnapshotPrimaryGoal =
  | "risk"
  | "energy"
  | "balanced"
  | "reduce_bill"
  | "reduce_risk"
  | "plan_upgrade";

export type ResolvedReportProfile = "investor" | "owner" | "tenant";
export type ResolvedModule = "energy" | "lifecycle";

export type ReportSelectionWeights = {
  energy: number;
  lifecycle: number;
};

export type AutoSelection = {
  profile?: ResolvedReportProfile;
  modules?: ResolvedModule[];
  weights: ReportSelectionWeights;
};

export function deriveAutoSelectionFromSnapshot(input: {
  occupancyType?: SnapshotOccupancyType;
  primaryGoal?: SnapshotPrimaryGoal;
}): AutoSelection {
  const occupancyType = input.occupancyType;
  const primaryGoal = input.primaryGoal;

  let profile: ResolvedReportProfile | undefined;
  let modules: ResolvedModule[] | undefined;
  let weights: ReportSelectionWeights = { energy: 30, lifecycle: 70 };

  if (occupancyType === "investment") {
    profile = "investor";
    modules = ["energy", "lifecycle"];
    weights = { energy: 30, lifecycle: 70 };
  } else if (occupancyType === "owner_occupied") {
    profile = "owner";
    modules = ["energy", "lifecycle"];
    weights = { energy: 70, lifecycle: 30 };
  } else if (occupancyType === "tenant") {
    profile = "tenant";
    modules = ["energy"];
    weights = { energy: 80, lifecycle: 20 };
  }

  if ((primaryGoal === "risk" || primaryGoal === "reduce_risk") && profile === "owner") {
    weights = { energy: 50, lifecycle: 50 };
  } else if (primaryGoal === "energy" || primaryGoal === "reduce_bill") {
    weights = { energy: 80, lifecycle: 20 };
  } else if (primaryGoal === "balanced" || primaryGoal === "plan_upgrade") {
    weights = { energy: 60, lifecycle: 40 };
  }

  return { profile, modules, weights };
}

export function getRecommendationText(profile?: ResolvedReportProfile): string {
  if (profile === "investor") {
    return "资产寿命预测 + 用电结构诊断（偏资产表现）";
  }
  if (profile === "owner") {
    return "用电结构诊断 + 优化建议（偏节能）";
  }
  if (profile === "tenant") {
    return "用电结构透明报告（用于沟通与证据）";
  }
  return "用电结构诊断（基础版）";
}
