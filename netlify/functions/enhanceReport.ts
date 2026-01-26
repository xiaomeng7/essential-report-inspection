import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import fs from "fs";
import path from "path";
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
    console.log("EnhanceReport handler started");
    const body = JSON.parse(event.body || "{}");
    const { inspection_id, report_html, findings, limitations } = body;

    console.log("Request body parsed:", { 
      has_inspection_id: !!inspection_id, 
      has_report_html: !!report_html,
      report_html_length: report_html?.length || 0,
      findings_count: findings?.length || 0,
      limitations_count: limitations?.length || 0
    });

    if (!inspection_id || !report_html) {
      console.error("Missing required fields:", { inspection_id: !!inspection_id, report_html: !!report_html });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing inspection_id or report_html" })
      };
    }

    // Check for OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error("OpenAI API key not configured. Please set OPENAI_API_KEY in Netlify environment variables.");
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "OpenAI API key not configured",
          message: "Please configure OPENAI_API_KEY in Netlify environment variables. Go to Site settings > Environment variables and add your OpenAI API key."
        })
      };
    }
    
    console.log("OpenAI API key found, length:", openaiApiKey.length);

    // Build the prompt for OpenAI
    const findingsText = findings && findings.length > 0
      ? `\n\nFindings:\n${findings.map((f: { id: string; priority: string; title?: string }) => 
          `- ${f.priority}: ${f.title || f.id}`
        ).join("\n")}`
      : "";

    const limitationsText = limitations && limitations.length > 0
      ? `\n\nLimitations:\n${limitations.map((l: string) => `- ${l}`).join("\n")}`
      : "";

    // Load report template for reference
    let templateContent = "";
    try {
      const templatePath = path.join(process.cwd(), "netlify", "functions", "report-template.html");
      console.log("Trying to load template from:", templatePath);
      if (fs.existsSync(templatePath)) {
        templateContent = fs.readFileSync(templatePath, "utf-8");
        console.log("Template loaded from netlify/functions, length:", templateContent.length);
      } else {
        const templatePath2 = path.join(process.cwd(), "report-template.html");
        console.log("Trying alternative template path:", templatePath2);
        if (fs.existsSync(templatePath2)) {
          templateContent = fs.readFileSync(templatePath2, "utf-8");
          console.log("Template loaded from root, length:", templateContent.length);
        } else {
          console.warn("Template file not found at either location");
        }
      }
    } catch (e) {
      console.error("Error loading report template for AI enhancement:", e);
    }

    const templateInstruction = templateContent 
      ? `\n\nPlease follow this report template structure and style:\n${templateContent.substring(0, 2000)}...`
      : "";

    const prompt = `You are a professional electrical inspection report writer. Please enhance and polish the following draft inspection report. 

Requirements:
1. Maintain all technical accuracy and factual information
2. Use professional, clear, and concise language
3. Follow Australian electrical inspection report standards
4. Ensure proper formatting and structure matching the template style
5. Keep the same inspection ID: ${inspection_id}
6. Preserve all findings and limitations exactly as provided
${templateInstruction}

Draft Report:
${report_html}
${findingsText}
${limitationsText}

Please return the enhanced report in HTML format, maintaining professional structure and readability while following the template style.`;

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
      let errorMessage = "Failed to enhance report";
      try {
        const errorJson = JSON.parse(errorData);
        errorMessage = errorJson.error?.message || errorJson.error?.code || errorMessage;
      } catch {
        // If parsing fails, use the raw error data
        errorMessage = errorData.substring(0, 200);
      }
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Failed to enhance report",
          message: errorMessage,
          details: errorData.substring(0, 500)
        })
      };
    }

    const data = await response.json();
    console.log("OpenAI API response received, choices count:", data.choices?.length || 0);
    const enhancedHtml = data.choices?.[0]?.message?.content || report_html;
    console.log("Enhanced HTML length:", enhancedHtml.length);

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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Error stack:", errorStack);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Internal server error",
        message: errorMessage,
        ...(process.env.NETLIFY_DEV && { stack: errorStack })
      })
    };
  }
};
