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

function loadDraft(): InspectionState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InspectionState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveDraft(state: InspectionState): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {}
}

export function useInspection() {
  const [state, setState] = useState<InspectionState>(() => loadDraft() ?? buildEmptyState());

  useEffect(() => {
    saveDraft(state);
  }, [state]);

  const setAnswer = useCallback((key: string, payload: Answer | AnswerValue) => {
    setState((prev) => {
      const next = deepClone(prev) as Record<string, unknown>;
      const ans: Answer =
        typeof payload === "object" && payload !== null && "status" in payload
          ? (payload as Answer)
          : { value: payload as AnswerValue, status: "answered" };
      setNested(next, key, ans);
      return next;
    });
  }, []);

  const setAnswerWithGateCheck = useCallback(
    (key: string, payload: Answer | AnswerValue, prevValue?: unknown) => {
      const newVal = typeof payload === "object" && "value" in (payload as Answer) ? (payload as Answer).value : payload;
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

  return {
    state,
    setAnswer,
    setAnswerWithGateCheck,
    clearPaths,
    getAnswer,
    getValue,
    clearDraft,
  };
}
