type Props = {
  inspectionId: string;
  address?: string;
  technicianName?: string;
  onNewInspection: () => void;
};

export function SuccessPage({ inspectionId, address, technicianName, onNewInspection }: Props) {
  return (
    <div className="app" style={{ maxWidth: 600, margin: "0 auto", padding: "20px" }}>
      <div style={{
        textAlign: "center",
        padding: "40px 20px",
        backgroundColor: "#f8f9fa",
        borderRadius: "8px",
        marginBottom: "30px",
      }}>
        <div style={{ fontSize: "64px", marginBottom: "20px" }}>✅</div>
        <h1 style={{ margin: "0 0 10px 0", color: "#2c3e50" }}>Inspection Submitted Successfully</h1>
        <p style={{ fontSize: "18px", color: "#666", margin: "0 0 30px 0" }}>
          Your inspection report has been submitted.
        </p>
      </div>

      <div style={{
        backgroundColor: "white",
        padding: "30px",
        borderRadius: "8px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        marginBottom: "20px",
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
          <span>
            {new Date().toLocaleString("en-AU", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: "30px" }}>
        <button
          type="button"
          onClick={onNewInspection}
          className="btn-primary"
          style={{
            padding: "14px 32px",
            fontSize: "1rem",
            fontWeight: "bold",
            borderRadius: "8px",
          }}
        >
          New Inspection
        </button>
      </div>
    </div>
  );
}
