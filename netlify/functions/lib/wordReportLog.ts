/**
 * 结构化日志：Word 报告生成/下载三条路径统一观测点，供生产排错。
 */

export type WordReportTrigger = "submit" | "download_fallback" | "review";

export type WordReportLogPayload = {
  inspection_id: string;
  trigger: WordReportTrigger;
  duration_ms: number;
  result: "success" | "fail";
  error_message?: string;
  blob_key?: string;
};

export function logWordReport(payload: WordReportLogPayload): void {
  console.log(JSON.stringify({ event: "word_report", ...payload }));
}
