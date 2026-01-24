import { useState, useCallback } from "react";
import { Wizard } from "./components/Wizard";
import { ReviewPage } from "./components/ReviewPage";

function App() {
  const [reviewId, setReviewId] = useState<string | null>(null);

  const handleSubmitted = useCallback((inspectionId: string) => {
    setReviewId(inspectionId);
    const url = `/review/${inspectionId}`;
    window.history.replaceState(null, "", url);
  }, []);

  const isReviewRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/review/");
  const idFromRoute = isReviewRoute ? window.location.pathname.replace(/^\/review\//, "") : null;

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
