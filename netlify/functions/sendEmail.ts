import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { sendEmailNotification, type EmailData } from "./lib/email";

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let data: EmailData;

  try {
    data = JSON.parse(event.body ?? "{}") as EmailData;
  } catch (e) {
    console.error("JSON parse error:", e);
    return { statusCode: 400, body: "Invalid JSON" };
  }

  try {
    await sendEmailNotification(data);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: "Email notification sent",
      }),
    };
  } catch (e) {
    console.error("Error sending email:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to send email",
        message: e instanceof Error ? e.message : String(e),
      }),
    };
  }
};
