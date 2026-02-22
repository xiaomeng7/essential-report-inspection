import assert from "node:assert";
import { aggregatePreflightEntries, parsePreflightSummaryLines } from "./aggregate-preflight-telemetry";

const mockLog = `
random line 1
[report-preflight-summary] {"inspection_id":"A1","profile":"owner","summary":{"warningCounts":{"BASELINE_INSUFFICIENT":1,"ASSETS_COVERAGE_UNKNOWN":1},"severity":"high","baselineComplete":false,"enhancedComplete":true,"assetsCoverage":"unknown","tariffSource":"default","circuitsCount":1,"enhancedSkipped":true,"enhancedSkipCode":"time_insufficient","subscriptionLead":true,"subscriptionLeadReasons":["OWNER_HIGH_SEVERITY"]}}
[report-preflight-summary] {"inspection_id":"A2","profile":"investor","summary":{"warningCounts":{"TARIFF_DEFAULT_USED":1},"severity":"medium","baselineComplete":true,"enhancedComplete":true,"assetsCoverage":"declared","tariffSource":"default","circuitsCount":2,"subscriptionLead":false,"subscriptionLeadReasons":[]}}
[report-preflight-summary] {"inspection_id":"A3","profile":"owner","summary":{"warningCounts":{},"severity":"none","baselineComplete":true,"enhancedComplete":false,"assetsCoverage":"observed","tariffSource":"customer","circuitsCount":0,"subscriptionLead":false,"subscriptionLeadReasons":[]}}
[report-preflight-summary] {"inspection_id":"A4","profile":"owner","summary":{"warningCounts":{"ENHANCED_INSUFFICIENT":1},"severity":"high","baselineComplete":true,"enhancedComplete":false,"assetsCoverage":"unknown","tariffSource":"missing","circuitsCount":0,"subscriptionLead":true,"subscriptionLeadReasons":["OWNER_HIGH_SEVERITY"]}}
[report-preflight-summary] {"inspection_id":"A5","profile":"investor","summary":{"warningCounts":{"ASSETS_COVERAGE_UNKNOWN":1},"severity":"low","baselineComplete":true,"enhancedComplete":true,"assetsCoverage":"unknown","tariffSource":"customer","circuitsCount":3,"subscriptionLead":true,"subscriptionLeadReasons":["ASSETS_WITH_NON_MEASURED_CIRCUITS"]}}
[report-preflight-summary] {"inspection_id":"A6","profile":"owner","summary":{"warningCounts":{"BASELINE_INSUFFICIENT":1},"severity":"high","baselineComplete":false,"enhancedComplete":false,"assetsCoverage":"unknown","tariffSource":"missing","circuitsCount":0,"subscriptionLead":true,"subscriptionLeadReasons":["OWNER_HIGH_SEVERITY"]}}
[report-preflight-summary] {invalid_json
[report-preflight-summary]
`;

function main(): void {
  const parsed = parsePreflightSummaryLines(mockLog);
  assert.equal(parsed.parsedLines, 6, "parsedLines should be 6");
  assert.equal(parsed.skippedLines, 2, "skippedLines should be 2");

  const agg = aggregatePreflightEntries(parsed);
  assert.equal(agg.overall.totalReports, 6, "totalReports should be 6");
  assert.equal(agg.overall.highSeverityRate, 3 / 6, "highSeverityRate should be 0.5");
  assert.equal(agg.overall.defaultTariffRate, 2 / 6, "defaultTariffRate should be 0.333...");
  const top = agg.overall.topWarningCodes.find((x) => x.code === "BASELINE_INSUFFICIENT");
  assert.equal(top?.count, 2, "BASELINE_INSUFFICIENT count should be 2");
  assert.equal(agg.overall.subscriptionLeadRate, 4 / 6, "subscriptionLeadRate should be 0.666...");
  assert.equal(agg.overall.topEnhancedSkipCodes[0]?.code, "time_insufficient", "topEnhancedSkipCodes should include time_insufficient");

  console.log("✅ aggregate preflight telemetry tests passed");
}

main();
