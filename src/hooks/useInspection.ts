import { useState, useCallback, useEffect } from "react";
import { getSections } from "../lib/fieldDictionary";
import { getClearPathsForGateChange } from "../lib/gates";

const DRAFT_KEY = "inspection-draft";

export type AnswerValue = string | number | boolean | string[] | Record<string, unknown>[] | null;
export type Answer = {
  value: AnswerValue;
  status: "answered" | "skipped";
  skip_reason?: string;
  skip_note?: string;
};

export type InspectionState = Record<string, unknown>;

/** Staged photos per section (filled during form; uploaded after submit). */
export type StagedPhoto = { caption: string; dataUrl: string };
export type StagedPhotosBySection = Record<string, StagedPhoto[]>;

/** Issue detail captured when a field with on_issue_capture=true is triggered */
export type IssueDetail = {
  location: string;
  photo_ids: string[];  // base64 dataUrls until upload
  notes: string;
};
export type IssueDetailsByField = Record<string, IssueDetail>;

function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let v: unknown = obj;
  for (const p of parts) {
    if (v == null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[p];
  }
  return v;
}

function setNested(obj: Record<string, unknown>, path: string, val: unknown): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    let next = cur[p];
    if (next == null || typeof next !== "object") {
      next = {};
      cur[p] = next;
    }
    cur = next as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = val;
}

function deletePaths(obj: Record<string, unknown>, paths: string[]): void {
  for (const path of paths) {
    const parts = path.split(".");
    let cur: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      const next = cur[p];
      if (next == null || typeof next !== "object") break;
      cur = next as Record<string, unknown>;
    }
    delete cur[parts[parts.length - 1]];
  }
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

export function buildEmptyState(): InspectionState {
  const state: InspectionState = {};
  const sections = getSections();
  for (const s of sections) {
    for (const f of s.fields) {
      if (f.type === "array_object" || f.key.endsWith(".exceptions")) continue;
      const existing = getNested(state as Record<string, unknown>, f.key);
      if (existing === undefined) {
        const def: Answer = { value: null, status: "answered" };
        if (f.type === "boolean") def.value = false;
        if (f.type === "array_enum") def.value = [];
        if (f.key.endsWith(".no_exceptions")) def.value = false;
        setNested(state as Record<string, unknown>, f.key, def);
      }
    }
  }
  return state;
}

function saveDraft(state: InspectionState): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {}
}

export function useInspection() {
  // Always start with empty state on page load/refresh
  const [state, setState] = useState<InspectionState>(() => buildEmptyState());

  useEffect(() => {
    saveDraft(state);
  }, [state]);

  const setAnswer = useCallback((key: string, payload: Answer | AnswerValue) => {
    console.log(`useInspection.setAnswer: key="${key}", payload=`, payload);
    setState((prev) => {
      const next = deepClone(prev) as Record<string, unknown>;
      const ans: Answer =
        typeof payload === "object" && payload !== null && "status" in payload
          ? (payload as Answer)
          : { value: payload as AnswerValue, status: "answered" };
      console.log(`useInspection.setAnswer: setting key="${key}", answer=`, ans);
      setNested(next, key, ans);
      const check = getNested(next, key);
      console.log(`useInspection.setAnswer: after setNested, getNested("${key}")=`, check);
      return next;
    });
  }, []);

  const setAnswerWithGateCheck = useCallback(
    (key: string, payload: Answer | AnswerValue, prevValue?: unknown) => {
      const newVal: AnswerValue = typeof payload === "object" && payload !== null && "status" in payload 
        ? (payload as Answer).value 
        : (payload as AnswerValue);
      const paths = getClearPathsForGateChange(key, prevValue === true, newVal === false);
      if (paths.length) {
        const ok = window.confirm(
          "Changing this will clear related answers (e.g. exceptions). Continue?"
        );
        if (!ok) return;
      }
      setState((prev) => {
        const next = deepClone(prev) as Record<string, unknown>;
        const ans: Answer =
          typeof payload === "object" && payload !== null && "status" in payload
            ? (payload as Answer)
            : { value: newVal, status: "answered" };
        setNested(next, key, ans);
        deletePaths(next, paths);
        return next;
      });
    },
    []
  );
  const clearPaths = useCallback((paths: string[]) => {
    setState((prev) => {
      const next = deepClone(prev) as Record<string, unknown>;
      deletePaths(next, paths);
      return next;
    });
  }, []);

  const getAnswer = useCallback(
    (key: string): Answer | undefined => {
      const v = getNested(state as Record<string, unknown>, key);
      return v != null && typeof v === "object" && "status" in (v as object) ? (v as Answer) : undefined;
    },
    [state]
  );

  const getValue = useCallback(
    (key: string): unknown => {
      const a = getAnswer(key);
      return a?.value;
    },
    [getAnswer]
  );

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    setState(buildEmptyState());
  }, []);

  const getStagedPhotos = useCallback((): StagedPhotosBySection => {
    const v = (state as Record<string, unknown>)._staged_photos;
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      return v as StagedPhotosBySection;
    }
    return {};
  }, [state]);

  const setStagedPhotosForSection = useCallback(
    (sectionId: string, photos: StagedPhoto[]) => {
      setState((prev) => {
        const next = deepClone(prev) as Record<string, unknown>;
        const current = (next._staged_photos as StagedPhotosBySection) ?? {};
        next._staged_photos = { ...current, [sectionId]: photos };
        return next;
      });
    },
    []
  );

  const addStagedPhoto = useCallback((sectionId: string, photo: StagedPhoto) => {
    setState((prev) => {
      const next = deepClone(prev) as Record<string, unknown>;
      const current = ((next._staged_photos as StagedPhotosBySection) ?? {})[sectionId] ?? [];
      if (current.length >= 2) return prev;
      next._staged_photos = {
        ...(next._staged_photos as StagedPhotosBySection),
        [sectionId]: [...current, photo],
      };
      return next;
    });
  }, []);

  const removeStagedPhoto = useCallback((sectionId: string, index: number) => {
    setState((prev) => {
      const next = deepClone(prev) as Record<string, unknown>;
      const current = ((next._staged_photos as StagedPhotosBySection) ?? {})[sectionId] ?? [];
      const updated = current.filter((_, i) => i !== index);
      next._staged_photos = {
        ...(next._staged_photos as StagedPhotosBySection),
        [sectionId]: updated,
      };
      return next;
    });
  }, []);

  const updateStagedPhotoCaption = useCallback(
    (sectionId: string, index: number, caption: string) => {
      setState((prev) => {
        const next = deepClone(prev) as Record<string, unknown>;
        const current = ((next._staged_photos as StagedPhotosBySection) ?? {})[sectionId] ?? [];
        const updated = current.map((p, i) => (i === index ? { ...p, caption } : p));
        next._staged_photos = {
          ...(next._staged_photos as StagedPhotosBySection),
          [sectionId]: updated,
        };
        return next;
      });
    },
    []
  );

  // Issue detail management (for on_issue_capture fields)
  const getIssueDetail = useCallback(
    (fieldKey: string): IssueDetail | undefined => {
      const details = (state._issue_details as IssueDetailsByField) ?? {};
      return details[fieldKey];
    },
    [state]
  );

  const setIssueDetail = useCallback((fieldKey: string, detail: IssueDetail) => {
    setState((prev) => {
      const next = deepClone(prev) as Record<string, unknown>;
      const current = (next._issue_details as IssueDetailsByField) ?? {};
      next._issue_details = { ...current, [fieldKey]: detail };
      return next;
    });
  }, []);

  const getIssueDetails = useCallback((): IssueDetailsByField => {
    return (state._issue_details as IssueDetailsByField) ?? {};
  }, [state]);

  return {
    state,
    setAnswer,
    setAnswerWithGateCheck,
    clearPaths,
    getAnswer,
    getValue,
    clearDraft,
    getStagedPhotos,
    setStagedPhotosForSection,
    addStagedPhoto,
    removeStagedPhoto,
    updateStagedPhotoCaption,
    // Issue detail for on_issue_capture fields
    getIssueDetail,
    setIssueDetail,
    getIssueDetails,
  };
}
