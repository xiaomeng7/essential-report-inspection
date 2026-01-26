import { useState, useCallback, useEffect } from "react";
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
  const [pathname, setPathname] = useState<string>(
    typeof window !== "undefined" ? window.location.pathname : "/"
  );

  // Listen to route changes (including browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Also listen to manual navigation (replaceState/pushState)
  useEffect(() => {
    const originalReplaceState = window.history.replaceState;
    const originalPushState = window.history.pushState;
    
    const handleReplaceState = function(...args: Parameters<typeof window.history.replaceState>) {
      originalReplaceState.apply(window.history, args);
      setPathname(window.location.pathname);
    };
    
    const handlePushState = function(...args: Parameters<typeof window.history.pushState>) {
      originalPushState.apply(window.history, args);
      setPathname(window.location.pathname);
    };
    
    window.history.replaceState = handleReplaceState;
    window.history.pushState = handlePushState;
    
    return () => {
      window.history.replaceState = originalReplaceState;
      window.history.pushState = originalPushState;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // setPathname is stable from useState, doesn't need to be in deps

  const handleSubmitted = useCallback((inspectionId: string, address?: string, technicianName?: string) => {
    setSuccessData({ inspectionId, address, technicianName });
    window.history.replaceState(null, "", `/success/${inspectionId}`);
    setPathname(`/success/${inspectionId}`);
  }, []);

  const handleNewInspection = useCallback(() => {
    setSuccessData(null);
    setReviewId(null);
    window.history.replaceState(null, "", "/");
    setPathname("/");
  }, []);

  const isReviewRoute = pathname.startsWith("/review/");
  const isSuccessRoute = pathname.startsWith("/success/");
  const isAdminRoute = pathname.startsWith("/admin/rules");
  const idFromRoute = isReviewRoute ? pathname.replace(/^\/review\//, "") : null;
  const successIdFromRoute = isSuccessRoute ? pathname.replace(/^\/success\//, "") : null;

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
          setPathname("/");
        }}
      />
    );
  }

  return <Wizard onSubmitted={handleSubmitted} />;
}

export default App;
