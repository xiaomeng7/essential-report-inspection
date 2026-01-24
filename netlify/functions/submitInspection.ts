import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { save } from "./lib/store";
import { flattenFacts, evaluateFindings, collectLimitations, buildReportHtml } from "./lib/rules";

function genId(): string {
  const y = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `EH-${y}-${n}`;
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(event.body ?? "{}") as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }
  const inspection_id = genId();
  const facts = flattenFacts(raw);
  const findings = evaluateFindings(facts);
  const limitations = collectLimitations(raw);
  const report_html = buildReportHtml(findings, limitations);
  save(inspection_id, {
    inspection_id,
    raw,
    report_html,
    findings,
    limitations,
  });
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inspection_id,
      status: "accepted",
      review_url: `/review/${inspection_id}`,
    }),
  };
};
