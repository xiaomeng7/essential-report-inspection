import { useState, useEffect, useRef } from "react";
import { PhotoEvidenceSection } from "./PhotoEvidenceSection";

type Props = {
  inspectionId: string;
  onBack: () => void;
};

type ReviewData = {
  inspection_id: string;
  report_html: string;
  findings: Array<{ id: string; priority: string; title?: string }>;
  limitations?: string[];
  raw_data?: Record<string, unknown>;
};

export function ReviewPage({ inspectionId, onBack }: Props) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enhancedHtml, setEnhancedHtml] = useState<string | null>(null);
  const [templateHtml, setTemplateHtml] = useState<string | null>(null); // Template HTML with placeholders filled
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  // const [modelInfo, setModelInfo] = useState<{ model: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } } | null>(null); // Temporarily disabled with AI
  const [isGeneratingWord, setIsGeneratingWord] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);
  const [isGeneratingOfficialWord, setIsGeneratingOfficialWord] = useState(false);
  const [officialWordReady, setOfficialWordReady] = useState(false);
  const [officialWordError, setOfficialWordError] = useState<string | null>(null);
  const [isGeneratingMarkdownWord, setIsGeneratingMarkdownWord] = useState(false);
  const [markdownWordError, setMarkdownWordError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/review/${inspectionId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ReviewData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [inspectionId]);

  const handleEnhanceReport = async () => {
    if (!data) {
      console.error("Cannot enhance: data is null");
      return;
    }
    
    // AI enhancement temporarily disabled for testing to avoid API costs
    // Just show the template HTML directly without calling AI API
    console.log("AI enhancement disabled - showing template directly");
    
    setIsEnhancing(true);
    setEnhanceError(null);
    
    // Immediately show template HTML (with original data filled)
    const initialTemplateHtml = data.report_html; // This is already template-filled HTML
    setTemplateHtml(initialTemplateHtml);
    setEnhancedHtml(null); // Reset enhanced HTML
    
    // Simulate a short delay for UI consistency
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setIsEnhancing(false);
    console.log("Template displayed (AI disabled)");
    
    /* AI enhancement code - disabled for testing
    try {
      const requestBody = {
        inspection_id: data.inspection_id,
        report_html: data.report_html,
        findings: data.findings,
        limitations: data.limitations,
        raw_data: data.raw_data
      };
      
      const res = await fetch("/api/enhanceReport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const errorMessage = errorData.message || errorData.error || `HTTP ${res.status}`;
        throw new Error(errorMessage);
      }

      const result = await res.json();
      
      if (result.enhanced_html && result.enhanced_html.length > 100) {
        setEnhancedHtml(result.enhanced_html);
        setTemplateHtml(null);
      } else {
        setEnhanceError("AI返回了无效内容，请重试");
        setTemplateHtml(null);
      }
      
      // Model info temporarily disabled with AI
      // if (result.model_used) {
      //   setModelInfo({
      //     model: result.model_used,
      //     usage: result.usage
      //   });
      // }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
      setEnhanceError(errorMessage);
      console.error("Error enhancing report:", e);
      setTemplateHtml(null);
    } finally {
      setIsEnhancing(false);
    }
    */
  };

  const handleGeneratePDF = async () => {
    if (!reportRef.current) return;

    try {
      // Create a new window for printing with the report content
      // This ensures CSS @media print rules are properly applied
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        alert("无法打开打印窗口，请检查浏览器弹窗设置");
        return;
      }

      // Get the report HTML content
      const reportContent = reportRef.current.innerHTML;
      
      // Get all styles from the current document
      const styles = Array.from(document.styleSheets)
        .map((sheet) => {
          try {
            return Array.from(sheet.cssRules)
              .map((rule) => rule.cssText)
              .join("\n");
          } catch (e) {
            // Cross-origin stylesheets will throw an error, skip them
            return "";
          }
        })
      .filter(Boolean)
      .join("\n");
      
      // Create a complete HTML document with all styles and print media rules
      const printDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Electrical Property Health Assessment – ${data?.inspection_id || inspectionId}</title>
  <style>
    ${styles}
    
    /* Ensure print styles are applied */
    @media print {
      @page {
        size: A4;
        margin: 0;
      }
      body {
        margin: 0;
        padding: 0;
        background: #fff !important;
      }
      .page {
        margin: 0 !important;
        max-width: none !important;
        padding: 0 !important;
      }
      .card {
        box-shadow: none !important;
        border: none !important;
      }
      .cover, .bucket-head, .pill {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      /* Force a new printed page */
      .page-break {
        page-break-before: always !important;
        break-before: page !important;
      }
      /* Avoid splitting important blocks across pages */
      .avoid-break {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      /* Try not to split sections where possible */
      .section {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      /* Keep headings with the first content line where possible */
      h2, h3 {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
    }
  </style>
</head>
<body>
  ${reportContent}
</body>
</html>`;

      printWindow.document.write(printDocument);
      printWindow.document.close();
      
      // Wait for content to load, then trigger print dialog
      // The browser's print dialog will respect CSS @media print rules
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          // Note: The window will stay open so user can see the print preview
          // User can close it manually after printing/saving as PDF
        }, 250);
      };
    } catch (e) {
      console.error("Error generating PDF:", e);
      alert("生成 PDF 时出错，请重试");
    }
  };

  const handleGenerateWord = async () => {
    if (!data) {
      console.error("Cannot generate Word: data is null");
      return;
    }

    setIsGeneratingWord(true);
    setWordError(null);

    try {
      console.log("Generating Word document for:", data.inspection_id);
      
      const res = await fetch("/api/generateWord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspection_id: data.inspection_id
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const errorMessage = errorData.message || errorData.error || `HTTP ${res.status}`;
        throw new Error(errorMessage);
      }

      const result = await res.json();
      console.log("Word document generated:", result);

      // Download the Word document
      const downloadUrl = `/api/downloadWord?inspection_id=${data.inspection_id}`;
      window.open(downloadUrl, "_blank");
      
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
      setWordError(errorMessage);
      console.error("Error generating Word document:", e);
      alert(`生成 Word 文档时出错: ${errorMessage}`);
    } finally {
      setIsGeneratingWord(false);
    }
  };

  const handleGenerateOfficialWord = async () => {
    if (!data?.inspection_id) {
      alert("无法生成 Word 文档：缺少检查 ID");
      return;
    }

    setIsGeneratingOfficialWord(true);
    setOfficialWordError(null);
    setOfficialWordReady(false);

    try {
      console.log("Generating official Word document via generateWordReport for:", data.inspection_id);
      
      // Call generateWordReport with inspection_id
      const res = await fetch(`/.netlify/functions/generateWordReport?inspection_id=${encodeURIComponent(data.inspection_id)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const errorMessage = errorData.message || errorData.error || `HTTP ${res.status}`;
        console.error("API error response:", errorData);
        throw new Error(errorMessage);
      }

      const result = await res.json();
      console.log("Official Word document generated:", result);

      if (result.ok && result.inspection_id) {
        setOfficialWordReady(true);
      } else {
        throw new Error("生成失败，未返回有效的 inspection_id");
      }
      
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
      setOfficialWordError(errorMessage);
      console.error("Error generating official Word document:", e);
      
      // Show detailed error message
      const fullError = e instanceof Error ? e.toString() : String(e);
      console.error("Full error details:", fullError);
      
      // Display error in alert with more details
      alert(`生成 Word 官方版时出错:\n\n${errorMessage}\n\n请查看浏览器控制台获取更多详细信息。`);
    } finally {
      setIsGeneratingOfficialWord(false);
    }
  };

  const handleGenerateMarkdownWord = async () => {
    if (!data?.inspection_id) {
      alert("无法生成 Word 文档：缺少检查 ID");
      return;
    }

    setIsGeneratingMarkdownWord(true);
    setMarkdownWordError(null);

    try {
      console.log("Generating Markdown-based Word document for:", data.inspection_id);
      
      // Call generateMarkdownWord endpoint
      const res = await fetch(`/.netlify/functions/generateMarkdownWord?inspection_id=${encodeURIComponent(data.inspection_id)}`, {
        method: "GET"
      });

      if (!res.ok) {
        // Try to get error message from JSON response
        let errorMessage = `HTTP ${res.status}`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = res.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Get the Word document as blob
      const blob = await res.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.inspection_id}-report.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      console.log("✅ Word document downloaded successfully");
      
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
      setMarkdownWordError(errorMessage);
      console.error("Error generating Markdown-based Word document:", e);
      alert(`生成 Word 文档时出错:\n\n${errorMessage}`);
    } finally {
      setIsGeneratingMarkdownWord(false);
    }
  };

  if (loading) return <div className="review-page"><p>Loading…</p></div>;
  if (error) {
    return (
      <div className="review-page" style={{ padding: "20px" }}>
        <h2>Error Loading Report</h2>
        <p style={{ color: "#d32f2f", marginBottom: "16px" }}>
          {error.includes("404") 
            ? "Report not found. The inspection data may have expired or was not saved correctly." 
            : `Error: ${error}`}
        </p>
        <p style={{ color: "#666", fontSize: "14px", marginBottom: "16px" }}>
          Inspection ID: <code>{inspectionId}</code>
        </p>
        <button onClick={onBack} className="btn-secondary">Back to Home</button>
      </div>
    );
  }
  if (!data) return null;

  // Display priority: enhanced HTML > template HTML > original report HTML
  const displayHtml = enhancedHtml || templateHtml || data.report_html;
  const isEnhanced = enhancedHtml !== null;
  const isShowingTemplate = templateHtml !== null && enhancedHtml === null;
  
  // Log state changes for debugging
  if (typeof window !== "undefined" && window.location.search.includes("debug")) {
    console.log("ReviewPage render:", {
      has_enhancedHtml: !!enhancedHtml,
      enhancedHtml_length: enhancedHtml?.length || 0,
      displayHtml_length: displayHtml?.length || 0,
      isEnhanced,
      isEnhancing
    });
  }

  return (
    <div className="review-page">
      {/* Success banner after submission */}
      <div style={{
        backgroundColor: "#d4edda",
        border: "1px solid #c3e6cb",
        color: "#155724",
        padding: "16px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center"
      }}>
        <div style={{ fontSize: "32px", marginBottom: "8px" }}>✅</div>
        <strong>Inspection Submitted Successfully!</strong>
        <p style={{ margin: "8px 0 0", fontSize: "14px" }}>
          Add photo evidence below, then generate your report.
        </p>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px" }}>
          <h1 style={{ margin: 0, flex: 1 }}>
            {isEnhanced ? "Enhanced Report" : isShowingTemplate ? "Generating Report..." : "Draft Report"} — {data.inspection_id}
          </h1>
          {!isEnhanced && !isShowingTemplate && (
            <button 
              type="button" 
              className="btn-primary" 
              onClick={handleEnhanceReport}
              disabled={isEnhancing}
            >
              {isEnhancing ? "AI生成中..." : "AI生成report"}
            </button>
          )}
          {(isEnhanced || isShowingTemplate) && (
            <>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleGeneratePDF}
                disabled={isShowingTemplate}
              >
                生成PDF
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleGenerateWord}
                disabled={isGeneratingWord || isShowingTemplate}
              >
                {isGeneratingWord ? "生成Word中..." : "生成Word报告"}
              </button>
            </>
          )}
          {/* AI Generate Word button (Markdown-based) */}
          <div style={{ marginTop: "10px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button 
              type="button" 
              className="btn-primary" 
              onClick={handleGenerateMarkdownWord}
              disabled={isGeneratingMarkdownWord}
              style={{ 
                backgroundColor: "#4caf50",
                minWidth: "180px"
              }}
            >
              {isGeneratingMarkdownWord ? "AI 生成中..." : "AI 生成 Word"}
            </button>
          </div>
          
          {/* Official Word generation buttons */}
          <div style={{ marginTop: "10px", display: "flex", gap: "10px", alignItems: "center" }}>
            {!officialWordReady && (
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleGenerateOfficialWord}
                disabled={isGeneratingOfficialWord}
              >
                {isGeneratingOfficialWord ? "生成中..." : "AI 生成（Word 官方版）"}
              </button>
            )}
            {officialWordReady && data?.inspection_id && (
              <a
                href={`/.netlify/functions/downloadWord?inspection_id=${encodeURIComponent(data.inspection_id)}`}
                className="btn-primary"
                style={{ 
                  display: "inline-block", 
                  textDecoration: "none", 
                  textAlign: "center",
                  padding: "14px 20px"
                }}
                download
              >
                下载 Word（官方版）
              </a>
            )}
          </div>
        </div>
        {/* Model info temporarily disabled with AI */}
        {/* {modelInfo && (
          <div style={{ 
            fontSize: "12px", 
            color: "#666", 
            padding: "8px 12px", 
            backgroundColor: "#f5f5f5", 
            borderRadius: "4px",
            display: "inline-block"
          }}>
            <strong>AI模型:</strong> {modelInfo.model}
            {modelInfo.usage && (
              <span style={{ marginLeft: "12px" }}>
                • Tokens: {modelInfo.usage.total_tokens} (输入: {modelInfo.usage.prompt_tokens}, 输出: {modelInfo.usage.completion_tokens})
              </span>
            )}
          </div>
        )} */}
      </div>

      {enhanceError && (
        <div style={{ 
          padding: "12px", 
          marginBottom: "16px", 
          backgroundColor: "#ffebee", 
          color: "#c62828",
          borderRadius: "4px"
        }}>
          错误: {enhanceError}
        </div>
      )}

      {wordError && (
        <div style={{ 
          padding: "12px", 
          marginBottom: "16px", 
          backgroundColor: "#ffebee", 
          color: "#c62828",
          borderRadius: "4px"
        }}>
          <strong>Word生成错误:</strong> {wordError}
        </div>
      )}
      {markdownWordError && (
        <div style={{ 
          padding: "12px", 
          marginBottom: "16px", 
          backgroundColor: "#ffebee", 
          color: "#c62828",
          borderRadius: "4px"
        }}>
          <strong>AI 生成 Word 错误:</strong> {markdownWordError}
        </div>
      )}
      {officialWordError && (
        <div style={{ 
          padding: "16px", 
          marginBottom: "16px", 
          backgroundColor: "#ffebee", 
          color: "#c62828",
          borderRadius: "4px",
          border: "1px solid #ef5350",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontSize: "14px",
          lineHeight: "1.6"
        }}>
          <strong style={{ display: "block", marginBottom: "8px", fontSize: "16px" }}>
            Word官方版生成错误:
          </strong>
          <div style={{ fontFamily: "monospace", fontSize: "13px" }}>
            {officialWordError}
          </div>
        </div>
      )}

      {data.findings?.length > 0 && (
        <div className="report-html" style={{ marginBottom: 16 }}>
          <h2>Findings &amp; Photo Evidence</h2>
          <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
            Add photo evidence for each finding. Max 2 photos per finding. Photos will be included in the final report.
          </p>
          {data.findings.map((f) => (
            <div
              key={f.id}
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
                backgroundColor: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor:
                      f.priority === "IMMEDIATE"
                        ? "#dc3545"
                        : f.priority === "RECOMMENDED_0_3_MONTHS"
                        ? "#ffc107"
                        : "#28a745",
                    color: f.priority === "RECOMMENDED_0_3_MONTHS" ? "#000" : "#fff",
                  }}
                >
                  {f.priority === "IMMEDIATE"
                    ? "IMMEDIATE"
                    : f.priority === "RECOMMENDED_0_3_MONTHS"
                    ? "RECOMMENDED"
                    : "PLAN/MONITOR"}
                </span>
                <span style={{ fontWeight: 500 }}>{f.title ?? f.id}</span>
              </div>
              <PhotoEvidenceSection
                inspectionId={data.inspection_id}
                findingId={f.id}
                findingTitle={f.title}
              />
            </div>
          ))}
        </div>
      )}
      {data.limitations && data.limitations.length > 0 && (
        <div className="report-html" style={{ marginBottom: 16 }}>
          <h2>Limitations</h2>
          <ul>
            {data.limitations.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {(isEnhancing || isShowingTemplate) && (
        <div style={{ 
          padding: "20px", 
          textAlign: "center", 
          backgroundColor: "#f5f5f5", 
          borderRadius: "8px",
          marginBottom: "20px"
        }}>
          <p>{isShowingTemplate ? "正在使用AI增强报告内容..." : "AI正在生成报告，请稍候..."}</p>
        </div>
      )}
      <div 
        ref={reportRef}
        className="report-html" 
        key={enhancedHtml ? "enhanced" : templateHtml ? "template" : "original"} // Force re-render when HTML changes
        dangerouslySetInnerHTML={{ __html: displayHtml || "<p>No report content.</p>" }} 
        style={{ 
          opacity: (isEnhancing && !templateHtml) ? 0.5 : 1, // Don't fade if showing template
          transition: "opacity 0.3s"
        }}
      />
    </div>
  );
}
