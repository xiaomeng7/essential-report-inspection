import { useState, useCallback } from "react";
import { Wizard } from "./components/Wizard";
import { ReviewPage } from "./components/ReviewPage";
import { SuccessPage } from "./components/SuccessPage";
import { RulesAdmin } from "./components/RulesAdmin";

function App() {
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    inspectionId: string;
    address?: string;
    technicianName?: string;
  } | null>(null);

  const handleSubmitted = useCallback((inspectionId: string, address?: string, technicianName?: string) => {
    setSuccessData({ inspectionId, address, technicianName });
    window.history.replaceState(null, "", `/success/${inspectionId}`);
  }, []);

  const handleNewInspection = useCallback(() => {
    setSuccessData(null);
    setReviewId(null);
    window.history.replaceState(null, "", "/");
  }, []);

  const isReviewRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/review/");
  const isSuccessRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/success/");
  const isAdminRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/admin/rules");
  const idFromRoute = isReviewRoute ? window.location.pathname.replace(/^\/review\//, "") : null;
  const successIdFromRoute = isSuccessRoute ? window.location.pathname.replace(/^\/success\//, "") : null;

  if (successData || (successIdFromRoute && isSuccessRoute)) {
    return (
      <SuccessPage
        inspectionId={successData?.inspectionId || successIdFromRoute!}
        address={successData?.address}
        technicianName={successData?.technicianName}
        onNewInspection={handleNewInspection}
      />
    );
  }

  if (isAdminRoute) {
    return (
      <RulesAdmin
        onBack={() => {
          window.history.replaceState(null, "", "/");
        }}
      />
    );
  }

  if (reviewId || (idFromRoute && isReviewRoute)) {
    return (
      <ReviewPage
        inspectionId={reviewId || idFromRoute!}
        onBack={() => {
          setReviewId(null);
          window.history.replaceState(null, "", "/");
        }}
      />
    );
  }

  return <Wizard onSubmitted={handleSubmitted} />;
}

export default App;
