import { useMemo } from "react";

type Props = {
  inspectionId: string;
  address?: string;
  technicianName?: string;
  onNewInspection: () => void;
};

export function SuccessPage({ inspectionId, address, technicianName, onNewInspection }: Props) {
  const reviewUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/review/${inspectionId}`;
    }
    return `/review/${inspectionId}`;
  }, [inspectionId]);

  return (
    <div className="app" style={{ maxWidth: 600, margin: "0 auto", padding: "20px" }}>
      <div style={{ 
        textAlign: "center", 
        padding: "40px 20px",
        backgroundColor: "#f8f9fa",
        borderRadius: "8px",
        marginBottom: "30px"
      }}>
        <div style={{ fontSize: "64px", marginBottom: "20px" }}>✅</div>
        <h1 style={{ margin: "0 0 10px 0", color: "#2c3e50" }}>Inspection Submitted Successfully</h1>
        <p style={{ fontSize: "18px", color: "#666", margin: "0 0 30px 0" }}>
          Your inspection report has been submitted and an email notification has been sent.
        </p>
      </div>

      <div style={{ 
        backgroundColor: "white", 
        padding: "30px", 
        borderRadius: "8px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        marginBottom: "20px"
      }}>
        <h2 style={{ marginTop: 0, color: "#2c3e50" }}>Inspection Details</h2>
        <div style={{ marginBottom: "15px" }}>
          <strong style={{ display: "inline-block", width: "140px" }}>Inspection ID:</strong>
          <span style={{ fontFamily: "monospace", fontSize: "16px" }}>{inspectionId}</span>
        </div>
        {address && (
          <div style={{ marginBottom: "15px" }}>
            <strong style={{ display: "inline-block", width: "140px" }}>Property Address:</strong>
            <span>{address}</span>
          </div>
        )}
        {technicianName && (
          <div style={{ marginBottom: "15px" }}>
            <strong style={{ display: "inline-block", width: "140px" }}>Technician:</strong>
            <span>{technicianName}</span>
          </div>
        )}
        <div style={{ marginBottom: "15px" }}>
          <strong style={{ display: "inline-block", width: "140px" }}>Submitted:</strong>
          <span>{new Date().toLocaleString("en-AU", { 
            year: "numeric", 
            month: "long", 
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          })}</span>
        </div>
      </div>

      <div style={{ 
        backgroundColor: "#e8f4f8", 
        padding: "20px", 
        borderRadius: "8px",
        marginBottom: "20px",
        borderLeft: "4px solid #3498db"
      }}>
        <h3 style={{ marginTop: 0, color: "#2c3e50" }}>📧 Email Notification</h3>
        <p style={{ margin: "10px 0", color: "#555" }}>
          An email notification has been sent to <strong>info@bhtechnology.com.au</strong> with:
        </p>
        <ul style={{ margin: "10px 0", paddingLeft: "20px", color: "#555" }}>
          <li>Inspection ID and details</li>
          <li>Property address and technician information</li>
          <li>Key findings and priorities</li>
          <li>Limitations (if any)</li>
          <li>Link to view the full report</li>
        </ul>
      </div>

      <div style={{ display: "flex", gap: "15px", flexWrap: "wrap", justifyContent: "center" }}>
        <a 
          href={reviewUrl}
          className="btn-primary"
          style={{ 
            textDecoration: "none",
            display: "inline-block",
            padding: "12px 24px",
            backgroundColor: "#2c3e50",
            color: "white",
            borderRadius: "4px",
            fontWeight: "bold"
          }}
        >
          View Report
        </a>
        <button 
          type="button"
          onClick={onNewInspection}
          className="btn-secondary"
          style={{ 
            padding: "12px 24px",
            backgroundColor: "#95a5a6",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
        >
          New Inspection
        </button>
      </div>
    </div>
  );
}
