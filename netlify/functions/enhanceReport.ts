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

    // Extract text content that needs AI enhancement (before filling template)
    // This way AI only enhances text, and we preserve the template structure
    const imm = (findings || []).filter((f: { priority: string }) => f.priority === "IMMEDIATE");
    const rec = (findings || []).filter((f: { priority: string }) => f.priority === "RECOMMENDED_0_3_MONTHS");
    const plan = (findings || []).filter((f: { priority: string }) => f.priority === "PLAN_MONITOR");
    
    // Prepare text content for AI enhancement
    const textToEnhance = {
      executiveSummary: imm.length > 0
        ? `This assessment identified ${imm.length} immediate safety concern${imm.length > 1 ? "s" : ""} that require${imm.length === 1 ? "s" : ""} urgent attention. These items should be addressed promptly to ensure safe operation.`
        : rec.length > 0
        ? `The electrical installation is in acceptable condition with ${rec.length} item${rec.length > 1 ? "s" : ""} identified for monitoring or planned attention within the next 0-3 months.`
        : "The electrical installation presents a generally acceptable condition with no immediate safety concerns.",
      riskRatingFactors: imm.length > 0
        ? `${imm.length} immediate safety concern${imm.length > 1 ? "s" : ""} requiring urgent attention`
        : rec.length > 0
        ? `${rec.length} item${rec.length > 1 ? "s" : ""} requiring monitoring or planned attention`
        : "No immediate safety concerns identified",
      findings: {
        immediate: imm.map((f: { id: string; title?: string }) => f.title ?? f.id.replace(/_/g, " ")),
        recommended: rec.map((f: { id: string; title?: string }) => f.title ?? f.id.replace(/_/g, " ")),
        plan: plan.map((f: { id: string; title?: string }) => f.title ?? f.id.replace(/_/g, " "))
      },
      limitations: limitations || []
    };
    
    console.log("Text content prepared for AI enhancement:", {
      executiveSummary_length: textToEnhance.executiveSummary.length,
      findings_count: {
        immediate: textToEnhance.findings.immediate.length,
        recommended: textToEnhance.findings.recommended.length,
        plan: textToEnhance.findings.plan.length
      }
    });

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
        model: "gpt-4o-mini", // Using gpt-4o-mini is sufficient for text enhancement only
        messages: [
          {
            role: "system",
            content: "You are a professional electrical inspection report writer specializing in Australian electrical safety standards. You enhance text content to be more professional and polished while maintaining all technical accuracy. Return ONLY valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3, // Slightly higher for more natural text
        response_format: { type: "json_object" } // Force JSON response
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
    
    // Parse AI-enhanced text content
    let enhancedTexts;
    try {
      const aiResponse = data.choices?.[0]?.message?.content || "{}";
      enhancedTexts = JSON.parse(aiResponse);
      console.log("AI enhanced texts parsed successfully:", Object.keys(enhancedTexts));
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      // Fallback: use original texts
      enhancedTexts = textToEnhance;
    }
    
    // Build the final HTML using enhanced texts
    const templateBasedHtml = buildReportHtml(
      findings || [],
      limitations || [],
      inspection_id,
      raw_data,
      enhancedTexts // Pass enhanced texts to buildReportHtml
    );
    
    console.log("Final HTML generated with AI-enhanced texts, length:", templateBasedHtml.length);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspection_id,
        enhanced_html: enhancedHtml,
        original_html: report_html, // Return the original report HTML
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
