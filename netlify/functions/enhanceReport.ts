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

    const prompt = `You are a professional electrical inspection report writer. Enhance the following text content to be more professional and polished, while maintaining all technical accuracy.

Inspection ID: ${inspection_id}

Text content to enhance:

EXECUTIVE SUMMARY:
${textToEnhance.executiveSummary}

RISK RATING FACTORS:
${textToEnhance.riskRatingFactors}

IMMEDIATE FINDINGS:
${textToEnhance.findings.immediate.length > 0 ? textToEnhance.findings.immediate.join("\n") : "None"}

RECOMMENDED FINDINGS:
${textToEnhance.findings.recommended.length > 0 ? textToEnhance.findings.recommended.join("\n") : "None"}

PLAN/MONITOR FINDINGS:
${textToEnhance.findings.plan.length > 0 ? textToEnhance.findings.plan.join("\n") : "None"}

LIMITATIONS:
${textToEnhance.limitations.length > 0 ? textToEnhance.limitations.join("\n") : "None"}

Please return ONLY the enhanced text content in JSON format:
{
  "executiveSummary": "enhanced executive summary text",
  "riskRatingFactors": "enhanced risk rating factors text",
  "findings": {
    "immediate": ["enhanced finding 1", "enhanced finding 2", ...],
    "recommended": ["enhanced finding 1", ...],
    "plan": ["enhanced finding 1", ...]
  },
  "limitations": ["enhanced limitation 1", ...]
}

Maintain all technical accuracy and use professional Australian electrical inspection report language.`;

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
      console.log("Raw AI response:", aiResponse.substring(0, 500));
      enhancedTexts = JSON.parse(aiResponse);
      console.log("AI enhanced texts parsed successfully:", {
        has_executiveSummary: !!enhancedTexts.executiveSummary,
        has_riskRatingFactors: !!enhancedTexts.riskRatingFactors,
        has_findings: !!enhancedTexts.findings,
        findings_keys: enhancedTexts.findings ? Object.keys(enhancedTexts.findings) : [],
        has_limitations: !!enhancedTexts.limitations,
        executiveSummary_preview: enhancedTexts.executiveSummary?.substring(0, 100)
      });
      
      // Validate that we got enhanced content
      if (!enhancedTexts.executiveSummary && !enhancedTexts.findings) {
        console.warn("AI response missing expected fields, using original texts");
        enhancedTexts = textToEnhance;
      }
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      console.error("Raw response was:", data.choices?.[0]?.message?.content?.substring(0, 500));
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
    console.log("HTML preview (first 500 chars):", templateBasedHtml.substring(0, 500));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspection_id,
        enhanced_html: templateBasedHtml, // Return the final HTML with AI-enhanced texts
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
