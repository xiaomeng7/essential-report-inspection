import { useState, useEffect, useRef, useCallback } from "react";
import { PhotoEvidenceSection } from "./PhotoEvidenceSection";
import { CustomFindingsModal, type CustomFindingInput } from "./CustomFindingsModal";

type Props = {
  inspectionId: string;
  onBack: () => void;
};

type CustomFindingPending = {
  id: string;
  title: string;
  source: "gpo" | "lighting";
  roomLabel?: string;
};

type ReviewData = {
  inspection_id: string;
  report_html: string;
  findings: Array<{ id: string; priority: string; title?: string; location?: string; photo_ids?: string[] }>;
  limitations?: string[];
  raw_data?: Record<string, unknown>;
  custom_findings_pending?: CustomFindingPending[];
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
  const [isGeneratingMarkdownWord, setIsGeneratingMarkdownWord] = useState(false);
  const [markdownWordError, setMarkdownWordError] = useState<string | null>(null);
  const [customFindingsToFill, setCustomFindingsToFill] = useState<CustomFindingInput[] | null>(null);
  const [isSavingCustomFindings, setIsSavingCustomFindings] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/review/${inspectionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ReviewData;
      setData(json);
      if (json.report_html) setTemplateHtml(json.report_html);
      setEnhancedHtml(null);
      setIsEnhancing(false);
      setEnhanceError(null);
      const pending = json.custom_findings_pending ?? [];
      if (pending.length > 0) {
        setCustomFindingsToFill(
          pending.map((p) => ({
            id: p.id,
            title: p.title,
            source: p.source,
            roomLabel: p.roomLabel,
            safety: "",
            urgency: "",
            liability: "",
            budget_low: "",
            budget_high: "",
            priority: "",
            severity: "",
            likelihood: "",
            escalation: "",
          }))
        );
      } else {
        setCustomFindingsToFill(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  const handleSaveCustomFindings = async () => {
    if (!customFindingsToFill?.length || !inspectionId) return;
    setIsSavingCustomFindings(true);
    try {
      const res = await fetch(`/api/saveCustomFindings/${inspectionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_findings: customFindingsToFill }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadData();
      setCustomFindingsToFill(null);
    } catch (e) {
      console.error("Failed to save custom findings:", e);
      alert("保存失败：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsSavingCustomFindings(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadData().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [loadData]);

  const handleGenerateMarkdownWord = async () => {
    if (!data?.inspection_id) {
      alert("无法生成 Word 文档：缺少检查 ID");
      return;
    }

    setIsGeneratingMarkdownWord(true);
    setMarkdownWordError(null);

    try {
      console.log("Generating Markdown-based Word document for:", data.inspection_id);
      
      const res = await fetch(`/.netlify/functions/generateMarkdownWord?inspection_id=${encodeURIComponent(data.inspection_id)}`, {
        method: "GET",
      });

      if (!res.ok) {
        let errorMessage = `HTTP ${res.status}`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          errorMessage = res.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const blob = await res.blob();
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
            Report — {data.inspection_id}
          </h1>
          {/* 生成 Word：基于模板与规则，不使用 OpenAI/任何 AI API（测试阶段） */}
          <div style={{ marginTop: "10px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleGenerateMarkdownWord}
              disabled={isGeneratingMarkdownWord}
              style={{ backgroundColor: "#4caf50", minWidth: "160px" }}
            >
              {isGeneratingMarkdownWord ? "生成中..." : "生成 Word"}
            </button>
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

      {markdownWordError && (
        <div style={{ 
          padding: "12px", 
          marginBottom: "16px", 
          backgroundColor: "#ffebee", 
          color: "#c62828",
          borderRadius: "4px"
        }}>
          <strong>生成 Word 错误:</strong> {markdownWordError}
        </div>
      )}
      {data.findings?.length > 0 && (
        <div className="report-html" style={{ marginBottom: 16 }}>
          <h2>Findings &amp; Photo Evidence</h2>
          <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
            Photos added during inspection are shown next to each finding below. You can add more here (max 2 per finding). All photos will appear next to the corresponding issue in the generated report.
          </p>
          {data.findings.map((f, idx) => (
            <div
              key={`${f.id}-${f.location ?? ""}-${idx}`}
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
                <span style={{ fontWeight: 500 }}>
                  {f.title ?? f.id}
                  {f.location && <span style={{ color: "#666", fontWeight: 400 }}> — {f.location}</span>}
                </span>
              </div>
              <PhotoEvidenceSection
                inspectionId={data.inspection_id}
                findingId={f.id}
                findingTitle={f.title}
                existingPhotoIds={f.photo_ids}
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

      {customFindingsToFill && customFindingsToFill.length > 0 && (
        <CustomFindingsModal
          findings={customFindingsToFill}
          onChange={(index, field, value) => {
            setCustomFindingsToFill((prev) => {
              if (!prev) return prev;
              const next = [...prev];
              next[index] = { ...next[index], [field]: value };
              return next;
            });
          }}
          onConfirm={() => handleSaveCustomFindings()}
          onCancel={() => setCustomFindingsToFill(null)}
          saving={isSavingCustomFindings}
        />
      )}
    </div>
  );
}
