const RECIPIENT_EMAIL = "info@bhtechnology.com.au";

export type EmailData = {
  inspection_id: string;
  address: string;
  technician_name: string;
  findings: Array<{ id: string; priority: string; title?: string }>;
  limitations: string[];
  review_url: string;
  created_at: string;
};

export async function sendEmailNotification(data: EmailData): Promise<void> {
  try {
    const inspectionDate = new Date(data.created_at).toLocaleDateString("en-AU", { 
      year: "numeric", 
      month: "long", 
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    // Group findings by priority
    const immediate = data.findings.filter(f => f.priority === "IMMEDIATE");
    const recommended = data.findings.filter(f => f.priority === "RECOMMENDED_0_3_MONTHS");
    const planMonitor = data.findings.filter(f => f.priority === "PLAN_MONITOR");

    // Build email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background-color: #2c3e50; color: white; padding: 20px; }
    .content { padding: 20px; }
    .section { margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #2c3e50; }
    .finding { margin: 10px 0; padding: 10px; background-color: white; border-radius: 4px; }
    .priority { font-weight: bold; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-right: 10px; }
    .priority-IMMEDIATE { background-color: #e74c3c; color: white; }
    .priority-RECOMMENDED_0_3_MONTHS { background-color: #f39c12; color: white; }
    .priority-PLAN_MONITOR { background-color: #3498db; color: white; }
    .button { display: inline-block; padding: 12px 24px; background-color: #2c3e50; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px; }
    .limitations { margin-top: 20px; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; }
    .info-row { margin: 8px 0; }
    .info-label { font-weight: bold; display: inline-block; width: 150px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>New Electrical Inspection Report</h1>
    <p>Inspection ID: ${data.inspection_id}</p>
  </div>
  
  <div class="content">
    <div class="section">
      <h2>Inspection Details</h2>
      <div class="info-row">
        <span class="info-label">Inspection ID:</span>
        <span>${data.inspection_id}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date:</span>
        <span>${inspectionDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Property Address:</span>
        <span>${data.address}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Technician:</span>
        <span>${data.technician_name}</span>
      </div>
    </div>

    ${immediate.length > 0 ? `
    <div class="section">
      <h2>🚨 Immediate Attention Required</h2>
      ${immediate.map(f => `
        <div class="finding">
          <span class="priority priority-IMMEDIATE">IMMEDIATE</span>
          <strong>${f.title || f.id}</strong>
        </div>
      `).join("")}
    </div>
    ` : ""}

    ${recommended.length > 0 ? `
    <div class="section">
      <h2>⚠️ Recommended (0-3 months)</h2>
      ${recommended.map(f => `
        <div class="finding">
          <span class="priority priority-RECOMMENDED_0_3_MONTHS">RECOMMENDED</span>
          <strong>${f.title || f.id}</strong>
        </div>
      `).join("")}
    </div>
    ` : ""}

    ${planMonitor.length > 0 ? `
    <div class="section">
      <h2>📋 Plan / Monitor</h2>
      ${planMonitor.map(f => `
        <div class="finding">
          <span class="priority priority-PLAN_MONITOR">PLAN</span>
          <strong>${f.title || f.id}</strong>
        </div>
      `).join("")}
    </div>
    ` : ""}

    ${data.findings.length === 0 ? `
    <div class="section">
      <p><strong>No findings identified.</strong></p>
    </div>
    ` : ""}

    ${data.limitations && data.limitations.length > 0 ? `
    <div class="limitations">
      <h2>⚠️ Limitations</h2>
      <ul>
        ${data.limitations.map(l => `<li>${l}</li>`).join("")}
      </ul>
    </div>
    ` : ""}

    <div style="margin-top: 30px; text-align: center;">
      <a href="${data.review_url}" class="button">View Full Report</a>
    </div>

    <p style="margin-top: 30px; color: #666; font-size: 12px;">
      This is an automated notification from the Electrical Inspection System.
      <br>
      Report URL: <a href="${data.review_url}">${data.review_url}</a>
    </p>
  </div>
</body>
</html>
    `;

    // Build plain text version
    const emailText = `
New Electrical Inspection Report
Inspection ID: ${data.inspection_id}
Date: ${inspectionDate}
Property Address: ${data.address}
Technician: ${data.technician_name}

${immediate.length > 0 ? `
🚨 IMMEDIATE ATTENTION REQUIRED:
${immediate.map(f => `  - ${f.title || f.id}`).join("\n")}
` : ""}

${recommended.length > 0 ? `
⚠️ RECOMMENDED (0-3 months):
${recommended.map(f => `  - ${f.title || f.id}`).join("\n")}
` : ""}

${planMonitor.length > 0 ? `
📋 PLAN / MONITOR:
${planMonitor.map(f => `  - ${f.title || f.id}`).join("\n")}
` : ""}

${data.findings.length === 0 ? "No findings identified.\n" : ""}

${data.limitations && data.limitations.length > 0 ? `
⚠️ LIMITATIONS:
${data.limitations.map(l => `  - ${l}`).join("\n")}
` : ""}

View Full Report: ${data.review_url}

This is an automated notification from the Electrical Inspection System.
    `.trim();

    const subject = `New Inspection Report: ${data.inspection_id} - ${data.address}`;
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM || "Electrical Inspection <onboarding@resend.dev>";

    // Debug logging
    console.log("Email sending - Environment check:", {
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 5) + "..." : "none",
      from,
      recipient: RECIPIENT_EMAIL,
    });

    if (apiKey) {
      console.log("Attempting to send email via Resend...");
      const { Resend } = await import("resend");
      const resend = new Resend(apiKey);
      const { data: sendData, error } = await resend.emails.send({
        from,
        to: [RECIPIENT_EMAIL],
        subject,
        html: emailHtml,
        text: emailText,
      });
      if (error) {
        console.error("Resend send error:", JSON.stringify(error, null, 2));
        throw new Error(`Email send failed: ${error.message}`);
      }
      console.log("Email sent via Resend successfully:", {
        emailId: sendData?.id,
        to: RECIPIENT_EMAIL,
        from,
      });
    } else {
      console.log("Email notification prepared (RESEND_API_KEY not set, skipping send):", {
        to: RECIPIENT_EMAIL,
        subject,
        htmlLength: emailHtml.length,
        textLength: emailText.length,
        note: "Check Netlify environment variables: RESEND_API_KEY must be set",
      });
    }
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}
