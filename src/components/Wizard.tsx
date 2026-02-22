import { useEffect, useState, useMemo } from "react";
import { getSections } from "../lib/fieldDictionary";
import { isSectionGatedOut, isSectionAutoSkipped } from "../lib/gates";
import { validateSection } from "../lib/validation";
import { useInspection, type IssueDetailsByField } from "../hooks/useInspection";
import { SectionForm } from "./SectionForm";
import { SectionPhotoEvidence } from "./SectionPhotoEvidence";
import { ThermalSection } from "./ThermalSection";
import { getWizardPages } from "../lib/inspectionBlocks";
import { assignStagedPhotosToFindings } from "../lib/sectionToFindingsMap";
import { uploadInspectionPhoto } from "../lib/uploadInspectionPhotoApi";
import { getFindingForField } from "../lib/fieldToFindingMap";
import type { SectionDef } from "../lib/fieldDictionary";
import { deriveAutoSelectionFromSnapshot, getRecommendationText } from "../lib/reportSelectionPolicy";

const GATE_KEYS = new Set([
  "rcd_tests.performed",
  "gpo_tests.performed",
  "assets.has_solar_pv",
  "assets.has_battery",
  "assets.has_ev_charger",
]);

const S0_START_CONTEXT = "S0_START_CONTEXT";

/** Sections that have a photo evidence block below the form. */
const SECTIONS_WITH_PHOTOS = new Set([
  "S1_ACCESS_LIMITATIONS",
  "S2_SUPPLY_OVERVIEW",
  "S2_MAIN_SWITCH",
  "S2_SWITCHBOARD_OVERVIEW",
  "S2_METERBOX",
  "S3_SWITCHBOARD_CAPACITY_LABELS",
  "S4_EARTHING_MEN",
  "S4_CABLES_LEGACY",
  "S5_RCD_TESTS_SUMMARY",
  "S6_RCD_TESTS_EXCEPTIONS",
  "S7A_GPO_BY_ROOM",
  "S8_GPO_LIGHTING_EXCEPTIONS",
  "S3C_KITCHEN",
  "S3D_BATHROOMS",
  "S3E_LAUNDRY",
  "S3F_ROOF_SPACE",
  "S3G_EXTERIOR_GARAGE",
  "S3H_SMOKE_ALARMS",
  "S3I_GENERAL_OBSERVATIONS",
  "S9_SOLAR_BATTERY_EV",
  "S9B_POOL_HIGH_LOAD",
  "S5A_MEASURED_DATA",
  "S10_SIGNOFF",
]);

/** Static technician guidance at top of each section (no form changes). */
const SECTION_GUIDANCE: Record<string, string> = {
  S0_START_CONTEXT: "Enter property and job details to begin.",
  S1_ACCESS_LIMITATIONS: "Record which areas are accessible and any limitations.",
  S2_SUPPLY_OVERVIEW: "Check supply type, voltage, meter and consumer main.",
  S2_MAIN_SWITCH: "Check main switch presence, rating and type.",
  S2_SWITCHBOARD_OVERVIEW: "Check enclosure, labelling, access, heat marks, and overall condition.",
  S2_METERBOX: "Note ceramic/rewireable fuses and mixed old & new devices in meter box.",
  S3_SWITCHBOARD_CAPACITY_LABELS: "Check capacity, circuit schedule, labelling quality and any non-standard work.",
  S4_EARTHING_MEN: "Confirm MEN/earthing integrity and record test readings if present.",
  S4_CABLES_LEGACY: "Check supply cable condition, insulation and any legacy or unsafe cabling.",
  S5_RCD_TESTS_SUMMARY: "Confirm presence, test operation, record pass/fail, note any exceptions.",
  S6_RCD_TESTS_EXCEPTIONS: "List any RCD test failures or exceptions with location and details.",
  S7A_GPO_BY_ROOM: "Check physical condition, looseness, overheating marks, and test results where applicable.",
  S8_GPO_LIGHTING_EXCEPTIONS: "Record any GPO or lighting issues not already listed by room.",
  S7B_LIGHTING_BY_ROOM: "Inspect visible fittings, signs of heat damage, loose switches, and correct operation.",
  S3C_KITCHEN: "Inspect GPOs, lighting and switches; note any heat damage or compliance issues.",
  S3D_BATHROOMS: "Check IP rating, zoning, GPOs and fans; note any moisture or safety issues.",
  S3E_LAUNDRY: "Check GPOs, lighting and switch condition; note load and isolation.",
  S3F_ROOF_SPACE: "Inspect cable condition, junctions, clearances, and note access limitations.",
  S3G_EXTERIOR_GARAGE: "Check exterior and garage circuits, enclosures and weatherproofing.",
  S3H_SMOKE_ALARMS: "Confirm presence, location and operation of smoke alarms.",
  S3I_GENERAL_OBSERVATIONS: "Note any other observations not covered above.",
  S9_SOLAR_BATTERY_EV: "Record solar, battery or EV installation details and condition.",
  S9B_POOL_HIGH_LOAD: "Check pool and high-load circuits, RCD and isolation.",
  S5A_MEASURED_DATA: "Record measured values where applicable.",
  S6_EXCEPTIONS_COMPLETION: "Summarise client statements and any exceptions to the inspection.",
  S10_SIGNOFF: "Confirm completion and sign off.",
};

type VisibleStep = { pageId: string; pageTitle: string; sectionIds: string[] };

type Props = { onSubmitted: (inspectionId: string, address?: string, technicianName?: string) => void };

const DEFAULT_ENERGY_V2_CIRCUITS: Array<{
  label: string;
  category: "hot_water" | "ac" | "cooking" | "lighting" | "power" | "other";
  measuredCurrentA: number | "";
  evidenceCoverage: "measured" | "declared";
}> = [
  { label: "Hot Water", category: "hot_water", measuredCurrentA: "", evidenceCoverage: "measured" },
  { label: "A-C", category: "ac", measuredCurrentA: "", evidenceCoverage: "measured" },
  { label: "Cooking", category: "cooking", measuredCurrentA: "", evidenceCoverage: "measured" },
  { label: "Lighting", category: "lighting", measuredCurrentA: "", evidenceCoverage: "measured" },
  { label: "Power", category: "power", measuredCurrentA: "", evidenceCoverage: "measured" },
  { label: "Other", category: "other", measuredCurrentA: "", evidenceCoverage: "measured" },
];

/** Require at least one photo for every room/section that has an issue. Returns error message or null if valid. */
function validatePhotoEvidenceBeforeSubmit(state: Record<string, unknown>): string | null {
  const getVal = (path: string): unknown => {
    const parts = path.split(".");
    let v: unknown = state;
    for (const p of parts) {
      if (v == null || typeof v !== "object") return undefined;
      const next = (v as Record<string, unknown>)[p];
      if (next != null && typeof next === "object" && "value" in (next as object)) {
        v = (next as { value: unknown }).value;
      } else {
        v = next;
      }
    }
    return v;
  };
  const gpoRooms = getVal("gpo_tests.rooms");
  const gpoList = Array.isArray(gpoRooms) ? gpoRooms : [];
  for (let i = 0; i < gpoList.length; i++) {
    const r = gpoList[i] as Record<string, unknown>;
    if (!r || r.room_access === "not_accessible") continue;
    const issue = typeof r.issue === "string" ? r.issue.trim() : "";
    if (!issue || issue === "none") continue;
    const pids = r.photo_ids;
    const hasPhoto = Array.isArray(pids) && pids.length > 0;
    if (!hasPhoto) {
      const label = (r.room_type as string) || (r.room_name_custom as string) || `Room ${i + 1}`;
      return `Upload at least one photo for GPO room "${label}" with issues before submitting.`;
    }
  }
  const lightingRooms = getVal("lighting.rooms");
  const lightList = Array.isArray(lightingRooms) ? lightingRooms : [];
  for (let i = 0; i < lightList.length; i++) {
    const r = lightList[i] as Record<string, unknown>;
    if (!r || r.room_access === "not_accessible") continue;
    const issues = (r.issues as string[]) || [];
    const hasIssue = issues.some((x) => x && x !== "none" && x !== "other");
    if (!hasIssue) continue;
    const pids = r.photo_ids;
    const hasPhoto = Array.isArray(pids) && pids.length > 0;
    if (!hasPhoto) {
      const label = (r.room_type as string) || (r.room_name_custom as string) || `Room ${i + 1}`;
      return `Upload at least one photo for lighting/switch room "${label}" with issues before submitting.`;
    }
  }
  return null;
}

export function Wizard({ onSubmitted }: Props) {
  const [oneClickTestLoading, setOneClickTestLoading] = useState(false);
  const [oneClickTestError, setOneClickTestError] = useState<string | null>(null);
  const [serviceM8JobNumber, setServiceM8JobNumber] = useState("");
  const [serviceM8Loading, setServiceM8Loading] = useState(false);
  const [serviceM8Error, setServiceM8Error] = useState<string | null>(null);
  const [serviceM8Summary, setServiceM8Summary] = useState<{
    job_number: string;
    job_uuid: string;
    customer_name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    address_full: string | null;
    address_auto_filled: boolean;
    fetched_at: string;
    cache_hit: boolean;
  } | null>(null);
  const {
    state,
    setAnswer,
    setAnswerWithGateCheck,
    getValue,
    getAnswer,
    clearDraft,
    getStagedPhotos,
    addStagedPhoto,
    removeStagedPhoto,
    updateStagedPhotoCaption,
    getIssueDetail,
    setIssueDetail,
    getThermal,
    setThermal,
  } = useInspection();
  const [step, setStep] = useState(0);
  const [sectionErrors, setSectionErrors] = useState<Record<string, Record<string, string>>>({});

  const snapshotOccupancy = String(getValue("snapshot_intake.occupancyType") ?? "");
  const snapshotPrimaryGoal = String(getValue("snapshot_intake.primaryGoal") ?? "");
  const snapshotConcerns = Array.isArray(getValue("snapshot_intake.concerns"))
    ? (getValue("snapshot_intake.concerns") as string[])
    : [];
  const snapshotHasEv = Boolean(getValue("snapshot_intake.hasEv"));
  const snapshotHasSolar = Boolean(getValue("snapshot_intake.hasSolar"));
  const snapshotHasBattery = Boolean(getValue("snapshot_intake.hasBattery"));
  const [energyDefaultsApplied, setEnergyDefaultsApplied] = useState(false);
  const [energyEnhancedExpanded, setEnergyEnhancedExpanded] = useState(false);
  const energyPhaseSupply = String(getValue("energy_v2.supply.phaseSupply") ?? "single");
  const energyStressPerformed = Boolean(getValue("energy_v2.stressTest.performed") ?? true);
  const energyEnhancedSkipCode = String(getValue("energy_v2.enhancedSkipReason.code") ?? "");
  const energyEnhancedSkipNote = String(getValue("energy_v2.enhancedSkipReason.note") ?? "");
  const energyCircuits = Array.isArray(getValue("energy_v2.circuits"))
    ? (getValue("energy_v2.circuits") as Array<Record<string, unknown>>)
    : DEFAULT_ENERGY_V2_CIRCUITS;

  const recommendation = deriveAutoSelectionFromSnapshot({
    occupancyType:
      snapshotOccupancy === "owner_occupied" || snapshotOccupancy === "investment" || snapshotOccupancy === "tenant"
        ? snapshotOccupancy
        : undefined,
    primaryGoal:
      snapshotPrimaryGoal === "risk" ||
      snapshotPrimaryGoal === "energy" ||
      snapshotPrimaryGoal === "balanced" ||
      snapshotPrimaryGoal === "reduce_bill" ||
      snapshotPrimaryGoal === "reduce_risk" ||
      snapshotPrimaryGoal === "plan_upgrade"
        ? snapshotPrimaryGoal
        : undefined,
  });

  const toggleConcern = (value: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...snapshotConcerns, value]))
      : snapshotConcerns.filter((x) => x !== value);
    setAnswer("snapshot_intake.concerns", { value: next, status: "answered" });
  };

  useEffect(() => {
    if (energyDefaultsApplied) return;
    setAnswer("energy_v2.supply.phaseSupply", { value: "single", status: "answered" });
    setAnswer("energy_v2.supply.voltageV", { value: 230, status: "answered" });
    setAnswer("energy_v2.stressTest.performed", { value: true, status: "answered" });
    setAnswer("energy_v2.stressTest.durationSec", { value: 60, status: "answered" });
    setAnswer("energy_v2.circuits", { value: DEFAULT_ENERGY_V2_CIRCUITS, status: "answered" });
    setEnergyDefaultsApplied(true);
  }, [energyDefaultsApplied, setAnswer]);

  const updateEnergyCircuit = (index: number, patch: Record<string, unknown>) => {
    const next = energyCircuits.map((row, i) => (i === index ? { ...row, ...patch } : row));
    setAnswer("energy_v2.circuits", { value: next, status: "answered" });
  };

  const addEnergyCircuit = () => {
    const next = [...energyCircuits, { label: "Other", category: "other", measuredCurrentA: "", evidenceCoverage: "measured" }];
    setAnswer("energy_v2.circuits", { value: next, status: "answered" });
  };

  const removeEnergyCircuit = (index: number) => {
    const next = energyCircuits.filter((_, i) => i !== index);
    setAnswer("energy_v2.circuits", { value: next.length > 0 ? next : DEFAULT_ENERGY_V2_CIRCUITS, status: "answered" });
  };

  const sections = useMemo(() => getSections(), []);
  const sectionById = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, s])), [sections]);

  const visibleSteps = useMemo((): VisibleStep[] => {
    const pages = getWizardPages();
    const out: VisibleStep[] = [];
    for (const page of pages) {
      const sectionIds = page.sectionIds.filter(
        (id) => !isSectionGatedOut(id, state) && !isSectionAutoSkipped(id, state)
      );
      if (sectionIds.length > 0) {
        out.push({ pageId: page.id, pageTitle: page.titleEn, sectionIds });
      }
    }
    return out;
  }, [state]);

  /** Step 0 = Start Screen; steps 1..N = content pages. */
  const isStartScreen = step === 0;
  const currentStep = isStartScreen ? null : visibleSteps[step - 1] ?? null;
  const isFirst = step === 0;
  const isLast = !isStartScreen && step === visibleSteps.length;
  const progress = isStartScreen ? 0 : visibleSteps.length ? (step / visibleSteps.length) * 100 : 0;

  /** On last step: block submit if validation fails (required fields, photos for rooms with issues) */
  const completenessError = isLast ? validatePhotoEvidenceBeforeSubmit(state) : null;
  const submitDisabled = isLast && completenessError != null;

  const goNext = () => {
    if (isStartScreen) {
      setStep(1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!currentStep) return;
    const sectionsToValidate = currentStep.sectionIds;
    let allValid = true;
    const mergedErrors: Record<string, Record<string, string>> = {};
    for (const sectionId of sectionsToValidate) {
      const { valid, errors } = validateSection(sectionId, state);
      if (!valid) {
        allValid = false;
        mergedErrors[sectionId] = errors;
      }
    }
    if (!allValid) {
      setSectionErrors((prev) => ({ ...prev, ...mergedErrors }));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSectionErrors((prev) => {
      const next = { ...prev };
      sectionsToValidate.forEach((id) => delete next[id]);
      return next;
    });
    if (isLast) {
      const photoErr = validatePhotoEvidenceBeforeSubmit(state);
      if (photoErr) {
        const firstId = sectionsToValidate[0];
        setSectionErrors((prev) => ({ ...prev, [firstId]: { _submit: photoErr } }));
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      submitInspection();
      return;
    }
    setStep((s) => Math.min(s + 1, visibleSteps.length));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitInspection = async () => {
    const { _staged_photos, _issue_details, ...rest } = state as Record<string, unknown>;
    // Ensure thermal is included (getThermal returns defaults if missing)
    rest.thermal = getThermal();
    const issueDetailsForPayload: Record<string, { location: string; notes: string }> = {};
    const issueDetails = (_issue_details as IssueDetailsByField) ?? {};
    for (const [fieldKey, detail] of Object.entries(issueDetails)) {
      if (detail && (detail.location || detail.notes || detail.photo_ids?.length)) {
        issueDetailsForPayload[fieldKey] = { location: detail.location, notes: detail.notes };
      }
    }
    const payload = {
      created_at: new Date().toISOString(),
      ...rest,
      _issue_details_meta: issueDetailsForPayload,
    };
    try {
      const res = await fetch("/api/submitInspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text || `HTTP ${res.status}`;
        try {
          const j = JSON.parse(text) as { message?: string; error?: string };
          if (j.message) msg = j.message;
          else if (j.error) msg = j.error;
        } catch {
          /* use raw text */
        }
        throw new Error(msg);
      }
      const data = JSON.parse(text) as { inspection_id: string; status: string; review_url: string };
      const inspectionId = data.inspection_id;

      let findingIds: string[] = [];
      try {
        const reviewRes = await fetch(`/api/review/${inspectionId}`);
        if (reviewRes.ok) {
          const reviewJson = (await reviewRes.json()) as { findings?: Array<{ id: string }> };
          findingIds = (reviewJson.findings ?? []).map((f) => f.id);
        }
      } catch {
        console.warn("Could not fetch findings for photo upload");
      }

      for (const [fieldKey, detail] of Object.entries(issueDetails)) {
        if (!detail?.photo_ids?.length) continue;
        const findingId = getFindingForField(fieldKey);
        if (!findingId) continue;
        if (!findingIds.includes(findingId)) continue;
        const location = detail.location || "";
        const notes = detail.notes || "";
        const caption = location ? `${location}${notes ? " - " + notes : ""}` : (notes || "Issue photo");
        for (const dataUrl of detail.photo_ids.slice(0, 2)) {
          try {
            await uploadInspectionPhoto({
              inspection_id: inspectionId,
              finding_id: findingId,
              caption,
              image: dataUrl,
            });
          } catch (uploadErr) {
            console.error(`Photo upload failed for ${fieldKey}:`, uploadErr);
          }
        }
      }

      const stagedBySection =
        typeof _staged_photos === "object" && _staged_photos !== null && !Array.isArray(_staged_photos)
          ? (_staged_photos as Record<string, Array<{ caption: string; dataUrl: string }>>)
          : {};
      const hasStaged = Object.keys(stagedBySection).some((k) => (stagedBySection[k]?.length ?? 0) > 0);
      if (hasStaged && findingIds.length > 0) {
        try {
          const toUpload = assignStagedPhotosToFindings(stagedBySection, findingIds);
          for (const item of toUpload) {
            await uploadInspectionPhoto({
              inspection_id: inspectionId,
              finding_id: item.finding_id,
              caption: item.caption,
              image: item.dataUrl,
            });
          }
        } catch (uploadErr) {
          console.error("Staged photo upload failed:", uploadErr);
        }
      }

      clearDraft();
      const address = getValue("job.address") as string | undefined;
      const technicianName = getValue("signoff.technician_name") as string | undefined;
      onSubmitted(inspectionId, address, technicianName);
    } catch (e) {
      const firstSection = currentStep?.sectionIds[0];
      setSectionErrors((prev) => ({
        ...prev,
        ...(firstSection ? { [firstSection]: { _submit: (e as Error).message } } : {}),
      }));
    }
  };

  const currentPageHasS0 = currentStep?.sectionIds.includes(S0_START_CONTEXT);
  const currentPageIsInternalRooms = currentStep?.pageId === "internal_rooms";
  const currentPageIsSwitchboardRcd = currentStep?.pageId === "switchboard_rcd";
  const currentPageIsRoof = currentStep?.pageId === "roof_space";
  const currentPageIsEarthingExternal = currentStep?.pageId === "earthing_external";

  const saveDraftToStorage = () => {
    try {
      localStorage.setItem("inspection-draft", JSON.stringify(state));
    } catch {
      /* ignore */
    }
  };

  const handleServiceM8Prefill = async () => {
    const jobNumber = serviceM8JobNumber.trim();
    setServiceM8Error(null);
    setServiceM8Summary(null);
    if (!jobNumber) {
      setServiceM8Error("Please enter ServiceM8 Job / Work Number.");
      return;
    }
    if (jobNumber.length > 32) {
      setServiceM8Error("Job number too long. Please check and try again.");
      return;
    }
    setServiceM8Loading(true);
    try {
      const env = (import.meta as any).env as { VITE_SERVICEM8_PREFILL_SECRET?: string } | undefined;
      const secret = env?.VITE_SERVICEM8_PREFILL_SECRET;
      const headers: Record<string, string> = {};
      if (secret) {
        headers["X-Servicem8-Prefill-Secret"] = secret;
      }
      const res = await fetch(`/api/servicem8/job-prefill?job_number=${encodeURIComponent(jobNumber)}`, {
        method: "GET",
        headers,
      });
      const text = await res.text();
      if (text.trimStart().startsWith("<")) {
        throw new Error(
          res.status === 404
            ? "Prefill endpoint not found (404). Run netlify dev locally, or confirm Netlify deployed and route /api/servicem8/job-prefill is configured."
            : `Server returned HTML instead of data (HTTP ${res.status}). Run netlify dev locally, or check Netlify deployment and function config.`
        );
      }
      let json: any;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text.slice(0, 200) || `Request failed (${res.status})`);
      }
      if (!res.ok || json?.ok === false) {
        const code = json?.error || `HTTP_${res.status}`;
        if (code === "JOB_NOT_FOUND") {
          throw new Error("Job number not found in ServiceM8.");
        }
        if (code === "SERVICE_M8_NOT_CONFIGURED") {
          throw new Error("ServiceM8 integration not configured. Set SERVICEM8_API_KEY in Netlify environment variables.");
        }
        if (code === "INVALID_JOB_NUMBER") {
          throw new Error("Invalid job number. Please check and try again.");
        }
        if (code === "UNAUTHORIZED") {
          throw new Error("Prefill endpoint unauthorized. Check frontend configuration.");
        }
        // Check for ServiceM8 API token error in details
        const details = json?.details || json?.message || "";
        if (details.includes("invalid_token") || details.includes("API token invalid")) {
          throw new Error("ServiceM8 API token invalid or expired. Ask admin to check SERVICEM8_API_KEY in Netlify environment variables.");
        }
        throw new Error(details || `ServiceM8 call failed (${code})`);
      }

      const job = json.job as {
        job_uuid: string;
        job_number: string;
        customer_name: string;
        contact_name?: string | null;
        phone?: string | null;
        email?: string | null;
        address?:
          | string
          | {
              line1?: string | null;
              line2?: string | null;
              suburb?: string | null;
              state?: string | null;
              postcode?: string | null;
              full_address?: string | null;
            };
      };
      const cacheInfo = json.cache as { hit?: boolean; fetched_at?: string } | undefined;

      // 将客户名称写入 job.prepared_for，方便后续报告使用（prepared_for -> CLIENT_NAME）
      try {
        setAnswer("job.prepared_for", { value: job.customer_name, status: "answered" });
        setAnswer("job.serviceM8_job_number", { value: job.job_number, status: "answered" });
      } catch {
        // 非关键路径，忽略错误
      }

      const addr = job.address;
      let fullAddress: string | null = null;
      if (typeof addr === "string") {
        fullAddress = addr.trim() || null;
      } else if (addr && typeof addr === "object") {
        fullAddress =
          (addr.full_address as string | undefined)?.trim() ||
          (addr.line1 as string | undefined)?.trim() ||
          [addr.suburb, addr.state, addr.postcode].filter(Boolean).join(", ") ||
          null;
      }

      // 若 ServiceM8 返回了地址，尝试通过 Geocoding 转为 place_id 并自动填入 Property address
      let addressAutoFilled = false;
      if (fullAddress != null && String(fullAddress).trim().length >= 5) {
        try {
          const geoRes = await fetch(
            `/api/addressGeocode?address=${encodeURIComponent(fullAddress.trim())}`
          );
          const geoText = await geoRes.text();
          if (geoText.trimStart().startsWith("<")) {
            // Geocoding 返回 HTML（如 404），仍填入原始地址以便用户看到
            setAnswer("job.address", { value: fullAddress.trim(), status: "answered" });
          } else {
            const geoData = JSON.parse(geoText);
            if (geoRes.ok && geoData.place_id && geoData.formatted_address) {
              setAnswer("job.address", { value: geoData.formatted_address, status: "answered" });
              setAnswer("job.address_place_id", { value: geoData.place_id, status: "answered" });
              setAnswer("job.address_components", {
                value: geoData.components ?? {},
                status: "answered",
              });
              setAnswer("job.address_geo", {
                value: geoData.geo ?? null,
                status: "answered",
              });
              addressAutoFilled = true;
            } else {
              // Geocoding 未返回 place_id，仍填入原始地址
              setAnswer("job.address", { value: fullAddress.trim(), status: "answered" });
            }
          }
        } catch {
          // 地址反查失败，仍填入原始地址
          setAnswer("job.address", { value: fullAddress.trim(), status: "answered" });
        }
      }

      setServiceM8Summary({
        job_number: job.job_number,
        job_uuid: job.job_uuid,
        customer_name: job.customer_name,
        contact_name: job.contact_name ?? null,
        phone: job.phone ?? null,
        email: job.email ?? null,
        address_full: fullAddress,
        address_auto_filled: addressAutoFilled,
        fetched_at: cacheInfo?.fetched_at ?? new Date().toISOString(),
        cache_hit: !!cacheInfo?.hit,
      });
    } catch (e) {
      setServiceM8Error((e as Error).message || "ServiceM8 prefill failed. Please try again later.");
    } finally {
      setServiceM8Loading(false);
    }
  };

  return (
    <div className="app">
      <div className="wizard-content">
      <div className="progress-wrap">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="progress-text">
          {isStartScreen
            ? "Start"
            : `Page ${step} of ${visibleSteps.length}: ${currentStep?.pageTitle ?? ""}`}
        </p>
      </div>

      {isStartScreen && (
        <div className="start-screen">
          <h1 className="start-screen__title">Start Screen</h1>
          <div className="start-screen__card start-screen__card--brief">
            <h2 className="start-screen__brief-heading">For Inspectors</h2>
            <section className="start-screen__brief-section">
              <h3 className="start-screen__brief-label">Task</h3>
              <p className="start-screen__brief-text">Complete on-site electrical inspection: Indoor rooms → Switchboard & RCD → Roof space → External & finalise. Fill each item and capture photos; add notes when unusual or selecting "Other".</p>
            </section>
            <section className="start-screen__brief-section">
              <h3 className="start-screen__brief-label">Purpose</h3>
              <p className="start-screen__brief-text">Provide owners/investors with a structured electrical condition report for risk assessment and budget planning; includes priority, recommended timing and CapEx range.</p>
            </section>
            <section className="start-screen__brief-section">
              <h3 className="start-screen__brief-label">Notes</h3>
              <ul className="start-screen__brief-list">
                <li>Fill property address and client before starting; receive Inspection ID after submit, then add photos.</li>
                <li>RCD/GPO test results: record honestly; select "Not tested" if applicable, do not guess.</li>
                <li>Attach 1–2 photos per issue type for report reference and client clarity.</li>
              </ul>
            </section>
          </div>
          <div className="start-screen__card">
            <p className="start-screen__workflow-heading">Workflow</p>
            <ol className="start-screen__workflow-list">
              <li>Indoor Rooms</li>
              <li>Switchboard + RCD + Earthing</li>
              <li>Roof Space</li>
              <li>External + Finalise</li>
            </ol>
          </div>
          <div className="start-screen__card">
            <h2 className="start-screen__brief-heading">ServiceM8 Prefill (Optional)</h2>
            <p className="start-screen__brief-text">
              If you only have a ServiceM8 Job / Work Number, use this to fetch client details and auto-fill "Client" and "Property address". If no address in ServiceM8 or geocode fails, select address manually in the form.
            </p>
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={serviceM8JobNumber}
                onChange={(e) => setServiceM8JobNumber(e.target.value)}
                placeholder="Enter ServiceM8 Job / Work Number"
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  fontSize: 14,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={handleServiceM8Prefill}
                disabled={serviceM8Loading}
              >
                {serviceM8Loading ? "Fetching…" : "Fetch details"}
              </button>
            </div>
            {serviceM8Error && (
              <p className="validation-msg" style={{ marginTop: 8 }}>
                {serviceM8Error}
              </p>
            )}
            {serviceM8Summary && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 6,
                  border: "1px solid #e0e0e0",
                  background: "#fafafa",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <p>
                  <strong>Customer / Client:</strong>
                  {serviceM8Summary.customer_name || "-"}
                </p>
                {serviceM8Summary.contact_name && (
                  <p>
                    <strong>Contact：</strong>
                    {serviceM8Summary.contact_name}
                  </p>
                )}
                {serviceM8Summary.phone && (
                  <p>
                    <strong>Phone：</strong>
                    {serviceM8Summary.phone}
                  </p>
                )}
                {serviceM8Summary.email && (
                  <p>
                    <strong>Email：</strong>
                    {serviceM8Summary.email}
                  </p>
                )}
                {serviceM8Summary.address_full && (
                  <p>
                    <strong>Address (ServiceM8)：</strong>
                    {serviceM8Summary.address_full}
                  </p>
                )}
                <p style={{ marginTop: 4, color: "#666" }}>
                  Data source: ServiceM8 {serviceM8Summary.cache_hit ? "(cached)" : "(live)"} ·{" "}
                  {new Date(serviceM8Summary.fetched_at).toLocaleString()}
                </p>
                <p style={{ marginTop: 4, fontSize: 12, color: "#777" }}>
                  {serviceM8Summary.address_auto_filled
                    ? "Address auto-filled in Property address. Please verify and proceed."
                    : "If address not auto-filled, search and select via Property address in the form."}
                </p>
              </div>
            )}
          </div>
          <div className="start-screen__card">
            <h2 className="start-screen__brief-heading">Snapshot Intake (Optional, customer-facing summary)</h2>
            <p className="start-screen__brief-text">
              Capture role, goal, and key energy context. This is written to <code>raw.snapshot_intake</code> and used by report auto-selection.
            </p>
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              <label>
                <strong>Q1 你属于哪种情况？</strong>
                <select
                  value={snapshotOccupancy}
                  onChange={(e) => setAnswer("snapshot_intake.occupancyType", { value: e.target.value, status: "answered" })}
                  style={{ marginTop: 6, width: "100%" }}
                >
                  <option value="">请选择</option>
                  <option value="owner_occupied">我是自住房屋主</option>
                  <option value="investment">我是投资房房东</option>
                  <option value="tenant">我是租客</option>
                </select>
              </label>

              <label>
                <strong>Q2 你这次最想解决什么？</strong>
                <select
                  value={snapshotPrimaryGoal}
                  onChange={(e) => setAnswer("snapshot_intake.primaryGoal", { value: e.target.value, status: "answered" })}
                  style={{ marginTop: 6, width: "100%" }}
                >
                  <option value="">请选择</option>
                  <option value="reduce_bill">我想搞清楚电费钱花在哪里</option>
                  <option value="reduce_risk">我想降低安全/合规不确定性</option>
                  <option value="plan_upgrade">我准备升级，想先确认路径与预算</option>
                  <option value="balanced">我不确定</option>
                </select>
              </label>

              <div>
                <strong>Q3 房屋系统（可选）</strong>
                <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={snapshotHasSolar}
                      onChange={(e) => setAnswer("snapshot_intake.hasSolar", { value: e.target.checked, status: "answered" })}
                    />{" "}
                    太阳能
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={snapshotHasBattery}
                      onChange={(e) => setAnswer("snapshot_intake.hasBattery", { value: e.target.checked, status: "answered" })}
                    />{" "}
                    电池
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={snapshotHasEv}
                      onChange={(e) => setAnswer("snapshot_intake.hasEv", { value: e.target.checked, status: "answered" })}
                    />{" "}
                    电动车/一年内计划购买
                  </label>
                </div>
              </div>

              <div>
                <strong>Q4 最近是否遇到以下情况（可选）</strong>
                <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={snapshotConcerns.includes("high_bill")}
                      onChange={(e) => toggleConcern("high_bill", e.target.checked)}
                    />{" "}
                    电费明显上涨/难以解释
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={snapshotConcerns.includes("safety_uncertainty")}
                      onChange={(e) => toggleConcern("safety_uncertainty", e.target.checked)}
                    />{" "}
                    经常跳闸/担心线路老化
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={snapshotConcerns.includes("upgrade_planning")}
                      onChange={(e) => toggleConcern("upgrade_planning", e.target.checked)}
                    />{" "}
                    准备装修/加装设备但不确定容量
                  </label>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <strong>Q5 联系方式（可选）</strong>
                <input
                  type="text"
                  placeholder="姓名"
                  value={String(getValue("snapshot_intake.contact.name") ?? "")}
                  onChange={(e) => setAnswer("snapshot_intake.contact.name", { value: e.target.value, status: "answered" })}
                />
                <input
                  type="text"
                  placeholder="电话"
                  value={String(getValue("snapshot_intake.contact.phone") ?? "")}
                  onChange={(e) => setAnswer("snapshot_intake.contact.phone", { value: e.target.value, status: "answered" })}
                />
                <input
                  type="email"
                  placeholder="邮箱"
                  value={String(getValue("snapshot_intake.contact.email") ?? "")}
                  onChange={(e) => setAnswer("snapshot_intake.contact.email", { value: e.target.value, status: "answered" })}
                />
                <input
                  type="text"
                  placeholder="地址"
                  value={String(getValue("snapshot_intake.contact.address") ?? "")}
                  onChange={(e) => setAnswer("snapshot_intake.contact.address", { value: e.target.value, status: "answered" })}
                />
              </div>

              <div style={{ marginTop: 4, padding: 10, border: "1px solid #e5e7eb", borderRadius: 6 }}>
                <strong>系统推荐方案</strong>
                <p style={{ marginTop: 6 }}>
                  根据您的选择，我们建议本次报告包含：{getRecommendationText(recommendation.profile)}
                </p>
              </div>
            </div>
          </div>
          <div className="start-screen__card">
            <h2 className="start-screen__brief-heading">Energy Stress Test (v2)</h2>
            <p className="start-screen__brief-text">
              Record pressure test and circuit current measurements. Data is saved to <code>raw.energy_v2</code>.
            </p>
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <strong>Baseline Load Test (required)</strong>
                <label>
                  Phase:
                  <select
                    value={energyPhaseSupply}
                    onChange={(e) => setAnswer("energy_v2.supply.phaseSupply", { value: e.target.value, status: "answered" })}
                    style={{ marginLeft: 8 }}
                  >
                    <option value="single">single</option>
                    <option value="three">three</option>
                  </select>
                </label>
                {energyPhaseSupply === "single" ? (
                  <label>
                    Voltage (V):
                    <input
                      type="number"
                      value={String(getValue("energy_v2.supply.voltageV") ?? 230)}
                      onChange={(e) => setAnswer("energy_v2.supply.voltageV", { value: Number(e.target.value), status: "answered" })}
                      style={{ marginLeft: 8 }}
                    />
                  </label>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    <label>L1 Voltage (V): <input type="number" value={String(getValue("energy_v2.supply.voltageL1V") ?? "")} onChange={(e) => setAnswer("energy_v2.supply.voltageL1V", { value: Number(e.target.value), status: "answered" })} /></label>
                    <label>L2 Voltage (V): <input type="number" value={String(getValue("energy_v2.supply.voltageL2V") ?? "")} onChange={(e) => setAnswer("energy_v2.supply.voltageL2V", { value: Number(e.target.value), status: "answered" })} /></label>
                    <label>L3 Voltage (V): <input type="number" value={String(getValue("energy_v2.supply.voltageL3V") ?? "")} onChange={(e) => setAnswer("energy_v2.supply.voltageL3V", { value: Number(e.target.value), status: "answered" })} /></label>
                  </div>
                )}
                <label>
                  Main Switch (A):
                  <input
                    type="number"
                    value={String(getValue("energy_v2.supply.mainSwitchA") ?? "")}
                    onChange={(e) => setAnswer("energy_v2.supply.mainSwitchA", { value: Number(e.target.value), status: "answered" })}
                    style={{ marginLeft: 8 }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <strong>Stress Test (required)</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={energyStressPerformed}
                    onChange={(e) => setAnswer("energy_v2.stressTest.performed", { value: e.target.checked, status: "answered" })}
                  />{" "}
                  Performed
                </label>
                <label>Duration (sec): <input type="number" value={String(getValue("energy_v2.stressTest.durationSec") ?? 60)} onChange={(e) => setAnswer("energy_v2.stressTest.durationSec", { value: Number(e.target.value), status: "answered" })} /></label>
                {energyPhaseSupply === "single" ? (
                  <label>Total Current (A): <input type="number" value={String(getValue("energy_v2.stressTest.totalCurrentA") ?? "")} onChange={(e) => setAnswer("energy_v2.stressTest.totalCurrentA", { value: Number(e.target.value), status: "answered" })} /></label>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    <label>L1 Current (A): <input type="number" value={String(getValue("energy_v2.stressTest.currentA_L1") ?? "")} onChange={(e) => setAnswer("energy_v2.stressTest.currentA_L1", { value: Number(e.target.value), status: "answered" })} /></label>
                    <label>L2 Current (A): <input type="number" value={String(getValue("energy_v2.stressTest.currentA_L2") ?? "")} onChange={(e) => setAnswer("energy_v2.stressTest.currentA_L2", { value: Number(e.target.value), status: "answered" })} /></label>
                    <label>L3 Current (A): <input type="number" value={String(getValue("energy_v2.stressTest.currentA_L3") ?? "")} onChange={(e) => setAnswer("energy_v2.stressTest.currentA_L3", { value: Number(e.target.value), status: "answered" })} /></label>
                  </div>
                )}
                <label>Not tested reasons (comma separated): <input type="text" value={String((getValue("energy_v2.stressTest.notTestedReasons") as string[] | undefined)?.join(", ") ?? "")} onChange={(e) => setAnswer("energy_v2.stressTest.notTestedReasons", { value: e.target.value.split(",").map((x) => x.trim()).filter(Boolean), status: "answered" })} /></label>
              </div>

              <div style={{ display: "grid", gap: 8, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                  <strong>Enhanced Circuits (optional, default 6 rows)</strong>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEnergyEnhancedExpanded((v) => !v)}
                  >
                    {energyEnhancedExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>
                {!energyEnhancedExpanded && (
                  <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
                    Enhanced section is collapsed by default. Expand to edit circuits/tariff, or skip with reason.
                  </p>
                )}
                {energyEnhancedExpanded && (
                  <>
                    <div style={{ display: "grid", gap: 6 }}>
                      {energyCircuits.map((row, idx) => (
                        <div key={`energy-circuit-${idx}`} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr auto", gap: 6 }}>
                          <input
                            type="text"
                            value={String(row.label ?? "")}
                            onChange={(e) => updateEnergyCircuit(idx, { label: e.target.value })}
                            placeholder="label"
                          />
                          <select
                            value={String(row.category ?? "other")}
                            onChange={(e) => updateEnergyCircuit(idx, { category: e.target.value })}
                          >
                            <option value="hot_water">hot_water</option>
                            <option value="ac">ac</option>
                            <option value="cooking">cooking</option>
                            <option value="lighting">lighting</option>
                            <option value="power">power</option>
                            <option value="other">other</option>
                          </select>
                          <input
                            type="number"
                            value={String(row.measuredCurrentA ?? "")}
                            onChange={(e) => updateEnergyCircuit(idx, { measuredCurrentA: e.target.value === "" ? "" : Number(e.target.value) })}
                            placeholder="A"
                          />
                          <select
                            value={String(row.evidenceCoverage ?? "measured")}
                            onChange={(e) => updateEnergyCircuit(idx, { evidenceCoverage: e.target.value })}
                          >
                            <option value="measured">measured</option>
                            <option value="declared">declared</option>
                          </select>
                          <button type="button" className="btn-secondary" onClick={() => removeEnergyCircuit(idx)}>删除</button>
                        </div>
                      ))}
                      <button type="button" className="btn-secondary" onClick={addEnergyCircuit}>+ 添加分路</button>
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <strong>Tariff (optional)</strong>
                      <label>rate_c_per_kwh: <input type="number" value={String(getValue("energy_v2.tariff.rate_c_per_kwh") ?? "")} onChange={(e) => setAnswer("energy_v2.tariff.rate_c_per_kwh", { value: Number(e.target.value), status: "answered" })} /></label>
                      <label>supply_c_per_day: <input type="number" value={String(getValue("energy_v2.tariff.supply_c_per_day") ?? "")} onChange={(e) => setAnswer("energy_v2.tariff.supply_c_per_day", { value: Number(e.target.value), status: "answered" })} /></label>
                    </div>
                  </>
                )}

                <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (!energyEnhancedSkipCode) {
                        setAnswer("energy_v2.enhancedSkipReason.code", { value: "customer_not_allowed", status: "answered" });
                      }
                      setEnergyEnhancedExpanded(false);
                    }}
                  >
                    Skip Enhanced (record reason)
                  </button>
                  <label>
                    Skip reason:
                    <select
                      value={energyEnhancedSkipCode}
                      onChange={(e) => setAnswer("energy_v2.enhancedSkipReason.code", { value: e.target.value, status: "answered" })}
                      style={{ marginLeft: 8 }}
                    >
                      <option value="">-- select --</option>
                      <option value="customer_not_allowed">customer not allowed</option>
                      <option value="time_insufficient">time insufficient</option>
                      <option value="site_uncontrollable">site/device uncontrollable</option>
                      <option value="other">other</option>
                    </select>
                  </label>
                  <label>
                    Skip note:
                    <input
                      type="text"
                      value={energyEnhancedSkipNote}
                      onChange={(e) => setAnswer("energy_v2.enhancedSkipReason.note", { value: e.target.value, status: "answered" })}
                      placeholder="optional note"
                      style={{ marginLeft: 8 }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="start-screen__actions">
            <button type="button" className="btn-primary start-screen__btn" onClick={goNext}>
              Start / Continue
            </button>
          </div>
        </div>
      )}

      {!isStartScreen && currentStep && (
        <>
          <div className="wizard-page">
            <h1 className="wizard-page__title">{currentStep.pageTitle}</h1>

            {/* Page 1 – Internal Rooms: checklist reminder */}
            {currentPageIsInternalRooms && (
              <div className="wizard-page__banner wizard-page__banner--info">
                <p className="wizard-page__banner-heading">What to inspect</p>
                <ul>
                  <li>Lighting: operation, overheating, flicker, loose fittings</li>
                  <li>Switches: operation, labelling, condition</li>
                  <li>GPO (power points): test results by room; note any failures and add photos</li>
                </ul>
              </div>
            )}

            {/* Page 2 – Switchboard & RCD: compliance emphasis */}
            {currentPageIsSwitchboardRcd && (
              <div className="wizard-page__banner wizard-page__banner--compliance">
                <p className="wizard-page__banner-heading">Compliance-related</p>
                <p>Switchboard condition, RCD presence and testing, labelling and enclosure.</p>
              </div>
            )}

            {/* Page 3 – Roof: one-time access note */}
            {currentPageIsRoof && (
              <div className="wizard-page__banner wizard-page__banner--info">
                <p className="wizard-page__banner-heading">Roof space</p>
                <p>Complete all roof-related checks here. If access is not possible, record limitations below.</p>
              </div>
            )}

            {/* Page 4 – Earthing & External: final checks */}
            {currentPageIsEarthingExternal && (
              <div className="wizard-page__banner wizard-page__banner--info">
                <p className="wizard-page__banner-heading">Earthing & external</p>
                <p>Earthing system and external electrical items before leaving site.</p>
              </div>
            )}

            {/* S0: one-click test */}
            {currentPageHasS0 && (
              <div className="section wizard-page__card">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={oneClickTestLoading}
                  onClick={async () => {
                    setOneClickTestError(null);
                    setOneClickTestLoading(true);
                    try {
                      const r = await fetch("/sample-inspection-payload.json");
                      if (!r.ok) throw new Error("Sample data not generated. Run: npm run write-sample-payload");
                      const payload = await r.json();
                      const res = await fetch("/api/submitInspection", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      });
                      if (!res.ok) {
                        const text = await res.text();
                        throw new Error(text || `HTTP ${res.status}`);
                      }
                      const data = (await res.json()) as { inspection_id: string };
                      onSubmitted(data.inspection_id);
                    } catch (e) {
                      setOneClickTestError((e as Error).message);
                    } finally {
                      setOneClickTestLoading(false);
                    }
                  }}
                >
                  {oneClickTestLoading ? "Submitting…" : "One-click test (fill & submit → generate report)"}
                </button>
                {oneClickTestError && (
                  <p className="validation-msg" style={{ marginTop: 8 }}>
                    {oneClickTestError}
                  </p>
                )}
              </div>
            )}

            {/* Submit / section errors: block submit when validation fails (e.g. missing photos) */}
            {(completenessError || currentStep.sectionIds.some((id) => sectionErrors[id]?._submit)) && (
              <div className="wizard-page__card">
                <p className="validation-msg">
                  {completenessError ?? currentStep.sectionIds.map((id) => sectionErrors[id]?._submit).filter(Boolean)[0]}
                </p>
                {completenessError && (
                  <p style={{ fontSize: "13px", color: "#666", marginTop: "8px" }}>
                    Add at least one photo for each room with an issue, then Submit.
                  </p>
                )}
              </div>
            )}
            {currentStep.sectionIds.map((sectionId) => {
              const errs = sectionErrors[sectionId];
              if (!errs?._submit && errs && Object.keys(errs).length > 0) {
                const section = sectionById[sectionId] as SectionDef | undefined;
                const label = section?.title ?? sectionId;
                return (
                  <div key={sectionId} className="wizard-page__card">
                    <p className="validation-msg">
                      {label}: {Object.values(errs)[0]}
                    </p>
                  </div>
                );
              }
              return null;
            })}

            {/* Sections in this page */}
            {currentStep.sectionIds.map((sectionId) => {
              if (sectionId === "S_THERMAL") {
                return (
                  <div key="S_THERMAL" className="wizard-page__section-card">
                    <h2 className="wizard-page__section-title">Thermal Imaging (Premium)</h2>
                    <ThermalSection thermal={getThermal()} onThermalChange={setThermal} />
                  </div>
                );
              }
              const section = sectionById[sectionId] as SectionDef | undefined;
              if (!section) return null;
              return (
                <div key={section.id} className="wizard-page__section-card">
                  <h2 className="wizard-page__section-title">{section.title}</h2>
                  {SECTION_GUIDANCE[section.id] && (
                    <p className="section-guidance">{SECTION_GUIDANCE[section.id]}</p>
                  )}
                  <SectionForm
                    section={section}
                    state={state}
                    setAnswer={setAnswer}
                    setAnswerWithGateCheck={setAnswerWithGateCheck}
                    getValue={getValue}
                    getAnswer={getAnswer}
                    errors={sectionErrors[section.id] ?? {}}
                    gateKeys={GATE_KEYS}
                    getIssueDetail={getIssueDetail}
                    setIssueDetail={setIssueDetail}
                  />
                  {SECTIONS_WITH_PHOTOS.has(section.id) && (
                    <SectionPhotoEvidence
                      sectionId={section.id}
                      sectionTitle={section.title}
                      photos={getStagedPhotos()[section.id] ?? []}
                      onAddPhoto={addStagedPhoto}
                      onRemovePhoto={removeStagedPhoto}
                      onUpdateCaption={updateStagedPhotoCaption}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!isStartScreen && (
        <>
          <div className="actions actions--mobile">
            <button type="button" className="btn-secondary" onClick={goBack} disabled={isFirst}>
              Back
            </button>
            <button type="button" className="btn-primary" onClick={goNext} disabled={submitDisabled} title={submitDisabled ? completenessError ?? undefined : undefined}>
              {isLast ? "Submit Inspection" : "Next"}
            </button>
          </div>
          <div className="wizard-nav-fixed">
            <button type="button" className="wizard-nav-fixed__btn btn-secondary" onClick={goBack} disabled={isFirst}>
              Back
            </button>
            <button type="button" className="wizard-nav-fixed__btn btn-secondary" onClick={saveDraftToStorage}>
              Save Draft
            </button>
            <button type="button" className="wizard-nav-fixed__btn btn-primary" onClick={goNext} disabled={submitDisabled} title={submitDisabled ? completenessError ?? undefined : undefined}>
              {isLast ? "Submit Inspection" : "Next"}
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
