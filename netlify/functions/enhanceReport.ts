import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { get } from "./lib/store";

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { 
      statusCode: 405, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { inspection_id, report_html, findings, limitations } = body;

    if (!inspection_id || !report_html) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing inspection_id or report_html" })
      };
    }

    // Check for OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "OpenAI API key not configured" })
      };
    }

    // Build the prompt for OpenAI
    const findingsText = findings && findings.length > 0
      ? `\n\nFindings:\n${findings.map((f: { id: string; priority: string; title?: string }) => 
          `- ${f.priority}: ${f.title || f.id}`
        ).join("\n")}`
      : "";

    const limitationsText = limitations && limitations.length > 0
      ? `\n\nLimitations:\n${limitations.map((l: string) => `- ${l}`).join("\n")}`
      : "";

    const prompt = `You are a professional electrical inspection report writer. Please enhance and polish the following draft inspection report. 

Requirements:
1. Maintain all technical accuracy and factual information
2. Use professional, clear, and concise language
3. Follow Australian electrical inspection report standards
4. Ensure proper formatting and structure
5. Keep the same inspection ID: ${inspection_id}

Draft Report:
${report_html}
${findingsText}
${limitationsText}

Please return the enhanced report in HTML format, maintaining professional structure and readability.`;

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Using a cost-effective model
        messages: [
          {
            role: "system",
            content: "You are a professional electrical inspection report writer specializing in Australian electrical safety standards. You enhance reports while maintaining technical accuracy."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent, professional output
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenAI API error:", response.status, errorData);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Failed to enhance report",
          details: errorData.substring(0, 500)
        })
      };
    }

    const data = await response.json();
    const enhancedHtml = data.choices?.[0]?.message?.content || report_html;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspection_id,
        enhanced_html: enhancedHtml,
        original_html: report_html
      })
    };
  } catch (error) {
    console.error("Error enhancing report:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
};
