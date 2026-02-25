import type { ModuleId, ProductIntent } from "../reportEngine";
import type { ReportSelectionResult } from "./resolveReportSelection";

/**
 * v1 hard-coded mapping: which modules run for each product intent.
 * Lite: same modules as selection (baseline + enhanced + distributed energy); content trimmed in profileRenderer via isLite.
 * Pro/Essential: unchanged.
 */
export function getModulesForProductIntent(
  _productIntent: ProductIntent,
  selection: ReportSelectionResult
): ModuleId[] {
  return selection.modules ?? [];
}
