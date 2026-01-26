import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { save } from "./lib/store";
import { flattenFacts, evaluateFindings, collectLimitations, buildReportHtml } from "./lib/rules";
import { sendEmailNotification } from "./lib/email";

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
  } catch (e) {
    console.error("JSON parse error:", e);
    return { statusCode: 400, body: "Invalid JSON" };
  }
  try {
    console.log("Starting inspection processing...");
    const inspection_id = genId();
    console.log("Generated inspection_id:", inspection_id);
    
    console.log("Flattening facts...");
    const facts = flattenFacts(raw);
    console.log("Facts flattened, keys:", Object.keys(facts).length);
    
    console.log("Evaluating findings...");
    const findings = evaluateFindings(facts);
    console.log("Findings evaluated, count:", findings.length);
    
    console.log("Collecting limitations...");
    const limitations = collectLimitations(raw);
    console.log("Limitations collected, count:", limitations.length);
    
    console.log("Building report HTML...");
    const report_html = buildReportHtml(findings, limitations);
    console.log("Report HTML built, length:", report_html.length);
    
    console.log("Saving inspection...");
    save(inspection_id, {
      inspection_id,
      raw,
      report_html,
      findings,
      limitations,
    });
    console.log("Inspection saved successfully");
    
    // Extract address and technician name for email
    // Helper function to extract value from Answer object (handles nested Answer objects)
    const extractValue = (v: unknown): unknown => {
      if (v == null) return undefined;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
      if (typeof v === "object" && "value" in (v as object)) {
        const answerValue = (v as { value: unknown }).value;
        // If the value itself is an Answer object (nested), recursively extract
        if (typeof answerValue === "object" && answerValue !== null && "value" in (answerValue as object)) {
          return extractValue(answerValue);
        }
        return answerValue;
      }
      return undefined;
    };
    
    const address = (raw.job as Record<string, unknown>)?.address;
    const addressValue = extractValue(address) as string | undefined;
    
    const technicianName = (raw.signoff as Record<string, unknown>)?.technician_name;
    const technicianNameValue = extractValue(technicianName) as string | undefined;
    
    // Send email notification — MUST await so Netlify doesn't kill the process before Resend completes
    // Ensure review URL uses the correct format (without /api prefix for frontend route)
    // Use URL (production) or DEPLOY_PRIME_URL (preview), fallback to actual site domain
    const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://inspetionreport.netlify.app";
    // Remove trailing slash if present, ensure clean URL
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    const reviewUrl = `${cleanBaseUrl}/review/${inspection_id}`;
    console.log("Generated review URL:", reviewUrl, "from baseUrl:", baseUrl);
    console.log("Preparing to send email notification...");
    try {
      await sendEmailNotification({
        inspection_id,
        address: addressValue || "N/A",
        technician_name: technicianNameValue || "N/A",
        findings,
        limitations,
        review_url: reviewUrl,
        created_at: (raw.created_at as string) || new Date().toISOString(),
        raw_data: raw, // Include full inspection data for manual review
      });
      console.log("Email notification sent successfully (handler complete)");
    } catch (emailErr) {
      console.error("Failed to send email (inspection still saved):", {
        error: emailErr instanceof Error ? emailErr.message : String(emailErr),
        stack: emailErr instanceof Error ? emailErr.stack : undefined,
      });
      // Don't fail the request — inspection was saved; email is best-effort
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspection_id,
        status: "accepted",
        review_url: `/review/${inspection_id}`,
      }),
    };
  } catch (e) {
    console.error("Error processing inspection:", e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    console.error("Error stack:", errorStack);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: errorMessage,
        ...(process.env.NETLIFY_DEV && { stack: errorStack }),
      }),
    };
  }
};
