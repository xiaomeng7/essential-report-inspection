import { useState, useCallback, useEffect } from "react";
import { Wizard } from "./components/Wizard";
import { ReviewPage } from "./components/ReviewPage";
import { SuccessPage } from "./components/SuccessPage";
import { ConfigAdmin } from "./components/ConfigAdmin";
import { FindingsDebugPage } from "./components/FindingsDebugPage";

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

  // Ensure pathname is synced on mount - CRITICAL for SPA routing
  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      console.log("🚀 App mounted, current path:", currentPath, "state pathname:", pathname);
      // Always sync on mount to ensure correct routing
      setPathname(currentPath);
    }
  }, []); // Only run on mount

  // Listen to route changes (including browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const newPath = window.location.pathname;
      console.log("🔄 PopState event, updating pathname:", newPath);
      setPathname(newPath);
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

  const handleSubmitted = useCallback((inspectionId: string, _address?: string, _technicianName?: string) => {
    // Navigate to ReviewPage after submission (instead of SuccessPage)
    // This allows immediate photo upload and report generation
    setReviewId(inspectionId);
    window.history.replaceState(null, "", `/review/${inspectionId}`);
    setPathname(`/review/${inspectionId}`);
  }, []);

  const handleNewInspection = useCallback(() => {
    setSuccessData(null);
    setReviewId(null);
    window.history.replaceState(null, "", "/");
    setPathname("/");
  }, []);

  const isReviewRoute = pathname.startsWith("/review/");
  const isSuccessRoute = pathname.startsWith("/success/");
  const isFindingsDebugRoute = pathname === "/admin/findings-debug" || pathname.startsWith("/admin/findings-debug");
  const isConfigAdminRoute = pathname === "/admin/config" || pathname.startsWith("/admin/config/");
  const isAdminRoute = pathname === "/admin/rules" || pathname.startsWith("/admin/rules/");
  const idFromRoute = isReviewRoute ? pathname.replace(/^\/review\//, "") : null;
  const successIdFromRoute = isSuccessRoute ? pathname.replace(/^\/success\//, "") : null;
  
  // Immediate debug log
  if (typeof window !== "undefined") {
    console.log("📍 Current route check:", {
      pathname,
      windowPath: window.location.pathname,
      isConfigAdminRoute,
      isAdminRoute,
      willRenderConfigAdmin: isConfigAdminRoute,
    });
  }

  // Debug logging
  useEffect(() => {
    console.log("🔍 Route Debug:", {
      pathname,
      windowPathname: typeof window !== "undefined" ? window.location.pathname : "N/A",
      isConfigAdminRoute,
      isAdminRoute,
      isReviewRoute,
      isSuccessRoute,
    });
    
    // Warn if pathname doesn't match window.location.pathname
    if (typeof window !== "undefined" && pathname !== window.location.pathname) {
      console.warn("⚠️ Pathname mismatch! State:", pathname, "Window:", window.location.pathname);
    }
  }, [pathname, isConfigAdminRoute, isAdminRoute, isReviewRoute, isSuccessRoute]);

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

  if (isFindingsDebugRoute) {
    return (
      <FindingsDebugPage
        onBack={() => {
          window.history.replaceState(null, "", "/");
          setPathname("/");
        }}
      />
    );
  }

  // Check config admin route first (more specific)
  if (isConfigAdminRoute) {
    console.log("✅✅✅ RENDERING ConfigAdmin for pathname:", pathname);
    console.log("✅✅✅ Window location:", window.location.pathname);
    return (
      <ConfigAdmin
        onBack={() => {
          window.history.replaceState(null, "", "/");
          setPathname("/");
        }}
      />
    );
  } else if (pathname.startsWith("/admin")) {
    console.warn("⚠️⚠️⚠️ Path starts with /admin but isConfigAdminRoute is false!", {
      pathname,
      isConfigAdminRoute,
      isAdminRoute,
    });
  }

  // Check admin route (less specific) - redirect to config admin
  if (isAdminRoute) {
    console.log("🔄 Redirecting /admin/rules to /admin/config");
    // Redirect immediately
    if (typeof window !== "undefined" && window.location.pathname === "/admin/rules") {
      window.history.replaceState(null, "", "/admin/config?tab=rules");
      setPathname("/admin/config");
    }
    // Show ConfigAdmin with rules tab active
    return (
      <ConfigAdmin
        onBack={() => {
          window.history.replaceState(null, "", "/");
          setPathname("/");
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
