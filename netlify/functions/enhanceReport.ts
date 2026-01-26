import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import fs from "fs";
import path from "path";
import { get } from "./lib/store";
import { buildReportHtml } from "./lib/rules";

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
    const { inspection_id, report_html, findings, limitations, raw_data } = body;

    console.log("Request body parsed:", { 
      has_inspection_id: !!inspection_id, 
      has_report_html: !!report_html,
      report_html_length: report_html?.length || 0,
      findings_count: findings?.length || 0,
      limitations_count: limitations?.length || 0,
      has_raw_data: !!raw_data
    });

    if (!inspection_id || !report_html) {
      console.error("Missing required fields:", { inspection_id: !!inspection_id, report_html: !!report_html });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing inspection_id or report_html" })
      };
    }

    // Rebuild the report HTML using the template to ensure it's properly filled
    // This ensures we have the complete template structure before AI enhancement
    const templateBasedHtml = buildReportHtml(findings || [], limitations || [], inspection_id, raw_data);
    console.log("Template-based HTML generated, length:", templateBasedHtml.length);

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
    // Note: In Netlify Functions, files are bundled, so we try multiple possible locations
    let templateContent = "";
    const possiblePaths = [
      path.join(process.cwd(), "netlify", "functions", "report-template.html"),
      path.join(process.cwd(), "report-template.html"),
    ];
    
    for (const templatePath of possiblePaths) {
      try {
        console.log("Trying to load template from:", templatePath);
        if (fs.existsSync(templatePath)) {
          templateContent = fs.readFileSync(templatePath, "utf-8");
          console.log("Template loaded successfully from:", templatePath, "length:", templateContent.length);
          break;
        }
      } catch (e) {
        // Silently continue to next path
        console.log(`Template not found at ${templatePath}`);
      }
    }
    
    if (!templateContent) {
      console.warn("Template file not found at any location, AI will use default template structure");
      console.log("Tried paths:", possiblePaths);
      console.log("Current working directory:", process.cwd());
    }

    // Use the full template if available, or at least a substantial portion
    const templateToUse = templateContent || "";
    const templateLength = templateToUse.length;
    // Increase to 15000 to capture most of the template (template is ~20KB)
    // This ensures AI sees the full structure, CSS, and key sections
    const maxTemplateLength = 15000;
    const templateForPrompt = templateToUse.length > maxTemplateLength 
      ? templateToUse.substring(0, maxTemplateLength) + "\n\n[... remaining template structure continues with same pattern ...]"
      : templateToUse;
    
    console.log(`Template length: ${templateLength}, Using ${templateForPrompt.length} characters for prompt`);

    console.log("Template-based HTML length:", templateBasedHtml.length);
    console.log("Template-based HTML preview (first 1000 chars):", templateBasedHtml.substring(0, 1000));
    
    // Split the prompt to avoid token limits - put critical instructions first
    const prompt = `CRITICAL TASK: Return the COMPLETE HTML document below with ONLY text content enhanced. DO NOT shorten or truncate.

REQUIREMENTS:
1. Return EVERY character from <!DOCTYPE html> to </html> - COMPLETE document
2. Preserve ALL HTML tags, attributes, classes, IDs, CSS EXACTLY
3. ONLY enhance text within tags (make it more professional)
4. Output length MUST be >= input length (never shorter)
5. Keep inspection ID: ${inspection_id}
6. Maintain technical accuracy

COMPLETE HTML DOCUMENT (return ALL of it):

${templateBasedHtml}

FINAL REMINDER: Return the ENTIRE document. Every section, every tag, every style must be included.`;

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o", // Using gpt-4o for better HTML structure preservation (can switch back to gpt-4o-mini if needed)
        messages: [
          {
            role: "system",
            content: "You are a professional electrical inspection report writer specializing in Australian electrical safety standards. You enhance reports while maintaining technical accuracy. You MUST preserve HTML structure exactly as provided in templates."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2, // Lower temperature for more consistent output and better template adherence
        max_tokens: 16000 // Increased significantly to ensure complete HTML output (template is ~20KB)
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenAI API error:", response.status, errorData);
      let errorMessage = "Failed to enhance report";
      let userFriendlyMessage = "AI报告生成失败，请稍后重试。";
      
      try {
        const errorJson = JSON.parse(errorData);
        const apiError = errorJson.error;
        errorMessage = apiError?.message || apiError?.code || errorMessage;
        
        // Provide user-friendly messages for common errors
        if (apiError?.code === "insufficient_quota") {
          userFriendlyMessage = "OpenAI API配额不足。请检查您的OpenAI账户余额和计费设置。访问 https://platform.openai.com/account/billing 添加付款方式或充值。";
        } else if (apiError?.code === "invalid_api_key") {
          userFriendlyMessage = "OpenAI API密钥无效。请检查Netlify环境变量中的OPENAI_API_KEY配置。";
        } else if (apiError?.code === "rate_limit_exceeded") {
          userFriendlyMessage = "API请求频率过高，请稍后再试。";
        }
      } catch {
        // If parsing fails, use the raw error data
        errorMessage = errorData.substring(0, 200);
      }
      
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Failed to enhance report",
          message: userFriendlyMessage,
          technicalDetails: errorMessage,
          ...(process.env.NETLIFY_DEV && { fullError: errorData.substring(0, 500) })
        })
      };
    }

    const data = await response.json();
    console.log("OpenAI API response received, choices count:", data.choices?.length || 0);
    console.log("Model used:", data.model);
    console.log("Usage:", JSON.stringify(data.usage));
    
    let enhancedHtml = data.choices?.[0]?.message?.content || templateBasedHtml;
    
    // Clean up the response - remove markdown code blocks if present
    if (enhancedHtml.includes("```html")) {
      enhancedHtml = enhancedHtml.replace(/```html\n?/g, "").replace(/```\n?/g, "").trim();
    } else if (enhancedHtml.includes("```")) {
      enhancedHtml = enhancedHtml.replace(/```\n?/g, "").trim();
    }
    
    console.log("Enhanced HTML length:", enhancedHtml.length);
    console.log("Original template HTML length:", templateBasedHtml.length);
    console.log("HTML changed:", enhancedHtml !== templateBasedHtml);
    
    // Validate AI response - if it's significantly shorter than template, use template instead
    const lengthRatio = enhancedHtml.length / templateBasedHtml.length;
    console.log(`AI response validation:`, {
      enhanced_length: enhancedHtml.length,
      template_length: templateBasedHtml.length,
      ratio: `${(lengthRatio * 100).toFixed(1)}%`,
      has_doctype: enhancedHtml.includes("<!DOCTYPE"),
      has_html_tag: enhancedHtml.includes("<html")
    });
    
    if (lengthRatio < 0.7) {
      console.warn(`AI response too short (${(lengthRatio * 100).toFixed(1)}% of template), using template-based HTML instead`);
      enhancedHtml = templateBasedHtml;
    } else if (!enhancedHtml.includes("<!DOCTYPE") && !enhancedHtml.includes("<html")) {
      console.warn("AI response missing HTML structure, using template-based HTML");
      enhancedHtml = templateBasedHtml;
    } else if (lengthRatio < 0.9) {
      console.warn(`AI response shorter than expected (${(lengthRatio * 100).toFixed(1)}%), but using it anyway`);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspection_id,
        enhanced_html: enhancedHtml,
        original_html: templateBasedHtml, // Return the template-based HTML as original
        model_used: data.model || "gpt-4o-mini",
        usage: data.usage ? {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens
        } : undefined
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
