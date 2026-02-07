/**
 * LEGACY – DO NOT USE in new code.
 * @deprecated 独立发信入口，供运维/手动使用。
 *
 * 原用途：独立发信 API（POST body 触发 sendEmailNotification）。
 * 为什么不再使用：Submit 直接使用 lib/email.sendEmailNotification，无应用内 fetch('/api/sendEmail')。
 * 推荐新路径：发邮件由 Submit 自动触发；手动发信可保留此端点供运维 curl 使用，或确认无调用后移除。
 */
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
