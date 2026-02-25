import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { randomUUID } from "crypto";
import { save, type StoredInspection } from "./lib/store";
import { getBaseUrl } from "./lib/baseUrl";
import { sendEmailNotification } from "./lib/email";
import { handler as generateWordReportHandler } from "./generateWordReport";

export type LiteReportRequestBody = {
  customer?: { name?: string; email: string };
  snapshot_intake?: Record<string, unknown>;
  bill_upload_ref?: string;
  payment?: { paid: boolean; paymentRef?: string };
};

function normalizeSnapshotIntake(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  return input as Record<string, unknown>;
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const body = (event.body ? JSON.parse(event.body) : {}) as LiteReportRequestBody;
    const payment = body.payment;
    if (!payment?.paid) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "payment.paid is required and must be true" }),
      };
    }

    const email = body.customer?.email?.trim();
    const emailProvided = Boolean(email);
    if (!emailProvided) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "customer.email is required" }),
      };
    }

    const snapshot_intake = normalizeSnapshotIntake(body.snapshot_intake);
    const inspection_id = randomUUID();

    const raw: Record<string, unknown> = {
      snapshot_intake,
      product_intent: "lite",
      source: "lite_landing",
      created_at: new Date().toISOString(),
      customer_name: body.customer?.name,
      customer_email: email,
      payment_ref: body.payment?.paymentRef,
      bill_upload_ref: body.bill_upload_ref,
    };

    const inspection: StoredInspection = {
      inspection_id,
      raw,
      report_html: "",
      findings: [],
      limitations: [],
    };

    await save(inspection_id, inspection, event);
    console.log("[lite] inspection saved:", inspection_id);

    const syntheticEvent: HandlerEvent = {
      ...event,
      httpMethod: "POST",
      body: JSON.stringify({ inspection_id }),
    };
    const reportResponse = await generateWordReportHandler(syntheticEvent, context);
    if (reportResponse.statusCode !== 200) {
      const errBody = typeof reportResponse.body === "string" ? reportResponse.body : "";
      console.error("[lite] generateWordReport failed:", reportResponse.statusCode, errBody);
      return {
        statusCode: reportResponse.statusCode,
        headers: { "Content-Type": "application/json" },
        body: errBody || JSON.stringify({ error: "Report generation failed" }),
      };
    }

    const baseUrl = getBaseUrl(event);
    const download_url = `${baseUrl}/api/downloadWord?inspection_id=${encodeURIComponent(inspection_id)}`;

    const primaryGoal = (snapshot_intake.primaryGoal ?? snapshot_intake.primary_goal) as string | undefined;
    const devices = (snapshot_intake.devices ?? snapshot_intake.appliances) as string[] | undefined;
    const billBand = (snapshot_intake.billBand ?? snapshot_intake.bill_band) as string | undefined;
    const hasBillUpload = Boolean(body.bill_upload_ref);

    console.log("[lite-funnel]", JSON.stringify({
      inspection_id,
      productIntent: "lite",
      paid: true,
      emailProvided: true,
      hasBillUpload,
      primaryGoal: primaryGoal ?? "unknown",
      devices: Array.isArray(devices) ? devices : [],
      billBand: billBand ?? "unknown",
    }));

    try {
      await sendEmailNotification({
        inspection_id,
        address: "Lite Report",
        technician_name: "Energy Snapshot",
        findings: [],
        limitations: [],
        review_url: `${baseUrl}/review/${inspection_id}`,
        download_word_url: download_url,
        created_at: raw.created_at as string,
        raw_data: raw,
      });
    } catch (emailErr) {
      console.error("[lite] email send failed (report already saved):", emailErr);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspection_id,
        download_url,
        status: "generated",
      }),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[lite] error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Lite report failed", message }),
    };
  }
};
