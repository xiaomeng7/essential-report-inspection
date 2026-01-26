import { useState, useEffect, useRef } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

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
  const [modelInfo, setModelInfo] = useState<{ model: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } } | null>(null);
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
    
    console.log("Starting AI enhancement...", {
      inspection_id: data.inspection_id,
      has_findings: !!data.findings,
      findings_count: data.findings?.length || 0,
      has_raw_data: !!data.raw_data
    });
    
    setIsEnhancing(true);
    setEnhanceError(null);
    
    // Step 1: Immediately show template HTML (with original data filled)
    // This gives immediate feedback to the user
    const initialTemplateHtml = data.report_html; // This is already template-filled HTML
    setTemplateHtml(initialTemplateHtml);
    setEnhancedHtml(null); // Reset enhanced HTML
    
    console.log("Template HTML set, showing template with original data");
    
    try {
      const requestBody = {
        inspection_id: data.inspection_id,
        report_html: data.report_html,
        findings: data.findings,
        limitations: data.limitations,
        raw_data: data.raw_data
      };
      
      console.log("Sending request to /api/enhanceReport", {
        body_size: JSON.stringify(requestBody).length,
        has_raw_data: !!requestBody.raw_data
      });
      
      const res = await fetch("/api/enhanceReport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      console.log("Response received:", {
        status: res.status,
        ok: res.ok
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const errorMessage = errorData.message || errorData.error || `HTTP ${res.status}`;
        console.error("API error:", errorMessage, errorData);
        throw new Error(errorMessage);
      }

      const result = await res.json();
      console.log("AI enhancement result:", {
        has_enhanced_html: !!result.enhanced_html,
        enhanced_html_length: result.enhanced_html?.length || 0,
        model_used: result.model_used
      });
      
      if (result.enhanced_html && result.enhanced_html.length > 100) {
        // Step 2: Replace template HTML with AI-enhanced HTML
        console.log("Replacing template HTML with AI-enhanced HTML");
        setEnhancedHtml(result.enhanced_html);
        setTemplateHtml(null); // Clear template HTML since we now have enhanced version
      } else {
        console.warn("No valid enhanced_html in response");
        setEnhanceError("AI返回了无效内容，请重试");
        setTemplateHtml(null); // Clear template on error
      }
      
      if (result.model_used) {
        setModelInfo({
          model: result.model_used,
          usage: result.usage
        });
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
      setEnhanceError(errorMessage);
      console.error("Error enhancing report:", e);
      setTemplateHtml(null); // Clear template on error
    } finally {
      setIsEnhancing(false);
      console.log("Enhancement process completed");
    }
  };

  const handleGeneratePDF = async () => {
    if (!reportRef.current) return;

    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#f5f7fb" // Match the template background
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Calculate dimensions
      // html2canvas uses device pixels, we need to convert to mm
      // Assuming scale 2 means 2x device pixels, and 96 DPI base
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // Convert pixels to mm (at scale 2, 1px = 0.264583mm at 96 DPI)
      const imgWidthMM = imgWidth * 0.264583;
      const imgHeightMM = imgHeight * 0.264583;
      
      // Scale to fit page width
      const widthRatio = pdfWidth / imgWidthMM;
      const scaledWidth = pdfWidth;
      const scaledHeight = imgHeightMM * widthRatio;
      
      // Calculate number of pages needed
      const pagesNeeded = Math.ceil(scaledHeight / pdfHeight);
      
      // Add image to PDF with proper pagination
      let sourceY = 0;
      for (let page = 0; page < pagesNeeded; page++) {
        if (page > 0) {
          pdf.addPage();
        }
        
        // Calculate how much of the image fits on this page
        const remainingHeight = imgHeight - sourceY;
        const pageHeightPx = Math.min(
          remainingHeight,
          pdfHeight / widthRatio / 0.264583 // Convert back to pixels
        );
        
        // Create a canvas for this page
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = imgWidth;
        pageCanvas.height = pageHeightPx;
        const pageCtx = pageCanvas.getContext("2d");
        
        if (pageCtx) {
          // Draw the portion of the image for this page
          pageCtx.drawImage(
            canvas,
            0, sourceY, imgWidth, pageHeightPx,
            0, 0, imgWidth, pageHeightPx
          );
          
          const pageImgData = pageCanvas.toDataURL("image/png");
          const pageHeightMM = pageHeightPx * 0.264583 * widthRatio;
          
          // Add to PDF
          pdf.addImage(pageImgData, "PNG", 0, 0, scaledWidth, pageHeightMM);
        }
        
        sourceY += pageHeightPx;
      }

      const fileName = `Inspection_Report_${data?.inspection_id || inspectionId}.pdf`;
      pdf.save(fileName);
    } catch (e) {
      console.error("Error generating PDF:", e);
      alert("生成 PDF 时出错，请重试");
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
            <button 
              type="button" 
              className="btn-primary" 
              onClick={handleGeneratePDF}
              disabled={isShowingTemplate}
            >
              生成PDF
            </button>
          )}
        </div>
        {modelInfo && (
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
        )}
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

      {data.findings?.length > 0 && (
        <div className="report-html" style={{ marginBottom: 16 }}>
          <h2>Findings</h2>
          <ul>
            {data.findings.map((f) => (
              <li key={f.id}><strong>{f.priority}</strong> — {f.title ?? f.id}</li>
            ))}
          </ul>
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
