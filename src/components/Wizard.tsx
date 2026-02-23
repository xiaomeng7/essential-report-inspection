/**
 * CHANGELOG: Refined labels, placeholders, helper text for Job/Prefill, Main Load, Stress Test,
 * Optional Circuit, Customer Intake sections. UI-only; no field keys or payload changes.
 */
import { useEffect, useState, useMemo } from "react";
import { getSections } from "../lib/fieldDictionary";
import { isSectionGatedOut, isSectionAutoSkipped } from "../lib/gates";
import { validateSection } from "../lib/validation";
import { useInspection, type IssueDetailsByField } from "../hooks/useInspection";
import { SectionForm } from "./SectionForm";
import { SectionPhotoEvidence } from "./SectionPhotoEvidence";
import { ThermalSection } from "./ThermalSection";
import { getWizardPages, VIRTUAL_STEP_IDS } from "../lib/inspectionBlocks";
import { assignStagedPhotosToFindings } from "../lib/sectionToFindingsMap";
import { uploadInspectionPhoto } from "../lib/uploadInspectionPhotoApi";
import { getFindingForField } from "../lib/fieldToFindingMap";
import type { SectionDef } from "../lib/fieldDictionary";

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
  const [inspectionGuideExpanded, setInspectionGuideExpanded] = useState(false);
  const energyPhaseSupply = String(getValue("energy_v2.supply.phaseSupply") ?? "single");
  const energyStressPerformed = Boolean(getValue("energy_v2.stressTest.performed") ?? true);
  const energyEnhancedSkipCode = String(getValue("energy_v2.enhancedSkipReason.code") ?? "");
  const energyEnhancedSkipNote = String(getValue("energy_v2.enhancedSkipReason.note") ?? "");
  const energyCircuits = Array.isArray(getValue("energy_v2.circuits"))
    ? (getValue("energy_v2.circuits") as Array<Record<string, unknown>>)
    : DEFAULT_ENERGY_V2_CIRCUITS;

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
      if (sectionIds.length > 0 || VIRTUAL_STEP_IDS.has(page.id)) {
        out.push({ pageId: page.id, pageTitle: page.titleEn, sectionIds });
      }
    }
    return out;
  }, [state]);

  /** Step 0..N-1 = content pages; no separate start screen. */
  const currentStep = visibleSteps[step] ?? null;
  const isFirst = step === 0;
  const isLast = visibleSteps.length > 0 && step === visibleSteps.length - 1;
  const progress = visibleSteps.length ? ((step + 1) / visibleSteps.length) * 100 : 0;
  const isJobClient = currentStep?.pageId === "job_client";
  const isEnergyMainLoad = currentStep?.pageId === "energy_main_load";
  const isEnergyStress = currentStep?.pageId === "energy_stress";
  const isEnergyEnhanced = currentStep?.pageId === "energy_enhanced";
  const isSnapshotIntake = currentStep?.pageId === "snapshot_intake";

  /** On last step: block submit if validation fails (required fields, photos for rooms with issues) */
  const completenessError = isLast ? validatePhotoEvidenceBeforeSubmit(state) : null;
  const submitDisabled = isLast && completenessError != null;

  const goNext = () => {
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
          {visibleSteps.length > 0
            ? `Step ${step + 1} of ${visibleSteps.length}: ${currentStep?.pageTitle ?? ""}`
            : "Loading…"}
        </p>
      </div>

      {isJobClient && (
        <div className="start-screen">
          <h1 className="start-screen__title">Job & Client Context</h1>
          <div className="accordion" style={{ marginBottom: 16 }}>
            <div
              className="accordion-toggle"
              onClick={() => setInspectionGuideExpanded((v) => !v)}
              role="button"
              tabIndex={0}
            >
              Inspection Guide (click to expand)
              <span>{inspectionGuideExpanded ? "▼" : "▶"}</span>
            </div>
            {inspectionGuideExpanded && (
              <div className="accordion-content open">
                <h3>Task</h3>
                <p>Complete on-site electrical inspection: Indoor rooms → Safety device tests → Roof space → External & finalise. Fill each item and capture photos; add notes when unusual or selecting "Other".</p>
                <h3>Purpose</h3>
                <p>Provide owners/investors with a structured electrical condition report for risk assessment and budget planning; includes priority, recommended timing and CapEx range.</p>
                <h3>Notes</h3>
                <ul>
                  <li>Fill property address and client before starting; receive Inspection ID after submit, then add photos.</li>
                  <li>Safety device test results: record honestly; select "Not tested" if applicable, do not guess.</li>
                  <li>Attach 1–2 photos per issue type for report reference and client clarity.</li>
                </ul>
                <p><strong>Workflow:</strong> Indoor Rooms → Safety Device Tests → Roof Space → External + Finalise</p>
              </div>
            )}
          </div>
          <div className="start-screen__card">
            <h2 className="start-screen__brief-heading">ServiceM8 Prefill (Optional)</h2>
            <p className="start-screen__brief-text">
              Optional: used to auto-fill job and client details.
            </p>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>ServiceM8 Job Number</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <input
                type="text"
                value={serviceM8JobNumber}
                onChange={(e) => setServiceM8JobNumber(e.target.value)}
                placeholder="Enter ServiceM8 job/work number"
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
                {serviceM8Loading ? "Fetching…" : "Fetch Job Details"}
              </button>
              </div>
              <p className="small" style={{ marginTop: 8, color: "#666" }}>Retrieve client and address from ServiceM8 if available.</p>
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
          <div className="wizard-page__section-card">
            <h2 className="wizard-page__section-title">Property address and client</h2>
            <p className="section-guidance">Confirm or enter property address, client type and occupancy.</p>
            {(() => {
              const s0 = sectionById[S0_START_CONTEXT] as SectionDef | undefined;
              if (!s0) return null;
              return (
                <SectionForm
                  section={s0}
                  state={state}
                  setAnswer={setAnswer}
                  setAnswerWithGateCheck={setAnswerWithGateCheck}
                  getValue={getValue}
                  getAnswer={getAnswer}
                  errors={sectionErrors[s0.id] ?? {}}
                  gateKeys={GATE_KEYS}
                  getIssueDetail={getIssueDetail}
                  setIssueDetail={setIssueDetail}
                />
              );
            })()}
          </div>
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
            {oneClickTestError && <p className="validation-msg" style={{ marginTop: 8 }}>{oneClickTestError}</p>}
          </div>
          <div className="start-screen__actions">
            <button type="button" className="btn-primary start-screen__btn" onClick={goNext}>
              Next: Continue Inspection
            </button>
          </div>
        </div>
      )}

      {isEnergyMainLoad && (
        <div className="wizard-page">
          <h1 className="wizard-page__title">Step 1 – Main Load & Voltage</h1>
          <p className="section-guidance">Measure main supply phase, voltage, and main switch rating.</p>
          <div className="start-screen__card">
            <div style={{ display: "grid", gap: 10 }}>
              <div className="field">
                <label>Supply Phase</label>
                <select
                  value={energyPhaseSupply}
                  onChange={(e) => setAnswer("energy_v2.supply.phaseSupply", { value: e.target.value, status: "answered" })}
                  style={{ marginTop: 4 }}
                >
                  <option value="single">Single Phase</option>
                  <option value="three">Three Phase</option>
                </select>
                <p className="small" style={{ marginTop: 4, color: "#666" }}>Select the electrical supply phase.</p>
              </div>
              {energyPhaseSupply === "single" ? (
                <div className="field">
                  <label>Supply Voltage (V)</label>
                  <input
                    type="number"
                    value={String(getValue("energy_v2.supply.voltageV") ?? 230)}
                    onChange={(e) => setAnswer("energy_v2.supply.voltageV", { value: Number(e.target.value), status: "answered" })}
                    placeholder="e.g., 230"
                    style={{ marginTop: 4 }}
                  />
                  <p className="small" style={{ marginTop: 4, color: "#666" }}>Measured line voltage at main switchboard.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  <label>L1 Voltage (V): <input type="number" value={String(getValue("energy_v2.supply.voltageL1V") ?? "")} onChange={(e) => setAnswer("energy_v2.supply.voltageL1V", { value: Number(e.target.value), status: "answered" })} placeholder="e.g., 230" /></label>
                  <label>L2 Voltage (V): <input type="number" value={String(getValue("energy_v2.supply.voltageL2V") ?? "")} onChange={(e) => setAnswer("energy_v2.supply.voltageL2V", { value: Number(e.target.value), status: "answered" })} placeholder="e.g., 230" /></label>
                  <label>L3 Voltage (V): <input type="number" value={String(getValue("energy_v2.supply.voltageL3V") ?? "")} onChange={(e) => setAnswer("energy_v2.supply.voltageL3V", { value: Number(e.target.value), status: "answered" })} placeholder="e.g., 230" /></label>
                </div>
              )}
              <div className="field">
                <label>Main Switch Rating (A)</label>
                <input
                  type="number"
                  value={String(getValue("energy_v2.supply.mainSwitchA") ?? "")}
                  onChange={(e) => setAnswer("energy_v2.supply.mainSwitchA", { value: Number(e.target.value), status: "answered" })}
                  placeholder="e.g., 100"
                  style={{ marginTop: 4 }}
                />
                <p className="small" style={{ marginTop: 4, color: "#666" }}>Rated amperage of main circuit breaker.</p>
              </div>
            </div>
          </div>
          <div className="start-screen__actions">
            <button type="button" className="btn-primary start-screen__btn" onClick={goNext}>
              Next: Continue Inspection
            </button>
          </div>
        </div>
      )}

      {isEnergyStress && (
        <div className="wizard-page">
          <h1 className="wizard-page__title">Step 2 – Load Stress Test</h1>
          <p className="section-guidance">Record total current with key appliances ON to assess load stress.</p>
          <div className="start-screen__card">
            <div style={{ display: "grid", gap: 10 }}>
              <label>
                <input
                  type="checkbox"
                  checked={energyStressPerformed}
                  onChange={(e) => setAnswer("energy_v2.stressTest.performed", { value: e.target.checked, status: "answered" })}
                />{" "}
                Stress Test Performed
              </label>
              <p className="small" style={{ marginTop: -4, color: "#666" }}>Check if load stress measurements were completed.</p>
              <label>Test Duration (seconds) <input type="number" value={String(getValue("energy_v2.stressTest.durationSec") ?? 60)} onChange={(e) => setAnswer("energy_v2.stressTest.durationSec", { value: Number(e.target.value), status: "answered" })} placeholder="e.g., 60" style={{ marginLeft: 8 }} /></label>
              <p className="small" style={{ marginTop: -4, color: "#666" }}>Duration the loads were applied for stress measurement.</p>
              {energyPhaseSupply === "single" ? (
                <>
                  <label>Measured Total Current (A) <input type="number" value={String(getValue("energy_v2.stressTest.totalCurrentA") ?? "")} onChange={(e) => setAnswer("energy_v2.stressTest.totalCurrentA", { value: Number(e.target.value), status: "answered" })} placeholder="e.g., 85" style={{ marginLeft: 8 }} /></label>
                  <p className="small" style={{ marginTop: -4, color: "#666" }}>Total current draw with major loads ON.</p>
                </>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  <label>L1 Current (A): <input type="number" value={String(getValue("energy_v2.stressTest.currentA_L1") ?? "")} onChange={(e) => setAnswer("energy_v2.stressTest.currentA_L1", { value: Number(e.target.value), status: "answered" })} placeholder="e.g., 28" /></label>
                  <label>L2 Current (A): <input type="number" value={String(getValue("energy_v2.stressTest.currentA_L2") ?? "")} onChange={(e) => setAnswer("energy_v2.stressTest.currentA_L2", { value: Number(e.target.value), status: "answered" })} placeholder="e.g., 28" /></label>
                  <label>L3 Current (A): <input type="number" value={String(getValue("energy_v2.stressTest.currentA_L3") ?? "")} onChange={(e) => setAnswer("energy_v2.stressTest.currentA_L3", { value: Number(e.target.value), status: "answered" })} placeholder="e.g., 28" /></label>
                </div>
              )}
              {!energyStressPerformed && (
                <div className="field">
                  <label>If not tested, select reason</label>
                  <select
                    value={String((getValue("energy_v2.stressTest.notTestedReasons") as string[] | undefined)?.[0] ?? "")}
                    onChange={(e) => setAnswer("energy_v2.stressTest.notTestedReasons", { value: e.target.value ? [e.target.value] : [], status: "answered" })}
                    style={{ marginTop: 4 }}
                  >
                    <option value="">-- select --</option>
                    <option value="customer_declined">Customer declined to test</option>
                    <option value="safety_access">Safety or access restriction</option>
                    <option value="equipment_unavailable">Equipment unavailable</option>
                    <option value="other">Other (specify below)</option>
                  </select>
                  <p className="small" style={{ marginTop: 4, color: "#666" }}>Choose why you could not test, if skipped.</p>
                </div>
              )}
            </div>
          </div>
          <div className="start-screen__actions">
            <button type="button" className="btn-primary start-screen__btn" onClick={goNext}>
              Next: Continue Inspection
            </button>
          </div>
        </div>
      )}

      {isEnergyEnhanced && (
        <div className="wizard-page">
          <h1 className="wizard-page__title">Step 3 – Optional Circuit Breakdown</h1>
          <p className="section-guidance">Optional: enhance your report by measuring individual circuits. Skip if time limited.</p>
          <div className="start-screen__card">
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <strong>Detailed Circuit Breakdown (Optional)</strong>
              <button type="button" className="btn-secondary" onClick={() => setEnergyEnhancedExpanded((v) => !v)}>
                {energyEnhancedExpanded ? "Collapse" : "Expand"}
              </button>
            </div>
            {!energyEnhancedExpanded && (
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
                Expand this section to measure individual circuits for detailed energy distribution insights — optional.
              </p>
            )}
            {energyEnhancedExpanded && (
              <>
                <div style={{ display: "grid", gap: 6 }}>
                  {energyCircuits.map((row, idx) => (
                    <div key={`energy-circuit-${idx}`} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr auto", gap: 6, alignItems: "end" }}>
                      <div>
                        <label className="small">Circuit Name / Description</label>
                        <input type="text" value={String(row.label ?? "")} onChange={(e) => updateEnergyCircuit(idx, { label: e.target.value })} placeholder="e.g., Kitchen circuits" style={{ marginTop: 4, width: "100%" }} />
                      </div>
                      <select value={String(row.category ?? "other")} onChange={(e) => updateEnergyCircuit(idx, { category: e.target.value })}>
                        <option value="hot_water">hot_water</option>
                        <option value="ac">ac</option>
                        <option value="cooking">cooking</option>
                        <option value="lighting">lighting</option>
                        <option value="power">power</option>
                        <option value="other">other</option>
                      </select>
                      <div>
                        <label className="small">Measured Circuit Current (A)</label>
                        <input type="number" value={String(row.measuredCurrentA ?? "")} onChange={(e) => updateEnergyCircuit(idx, { measuredCurrentA: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="e.g., 15" style={{ marginTop: 4, width: "100%" }} />
                      </div>
                      <select value={String(row.evidenceCoverage ?? "measured")} onChange={(e) => updateEnergyCircuit(idx, { evidenceCoverage: e.target.value })}>
                        <option value="measured">measured</option>
                        <option value="declared">declared</option>
                      </select>
                      <button type="button" className="btn-secondary" onClick={() => removeEnergyCircuit(idx)}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="btn-secondary" onClick={addEnergyCircuit}>+ Add circuit</button>
                </div>
                <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
                  <strong>Tariff (if known)</strong>
                  <label>rate_c_per_kwh <input type="number" value={String(getValue("energy_v2.tariff.rate_c_per_kwh") ?? "")} onChange={(e) => setAnswer("energy_v2.tariff.rate_c_per_kwh", { value: Number(e.target.value), status: "answered" })} placeholder="cents per kWh" style={{ marginLeft: 8 }} /></label>
                  <label>supply_c_per_day <input type="number" value={String(getValue("energy_v2.tariff.supply_c_per_day") ?? "")} onChange={(e) => setAnswer("energy_v2.tariff.supply_c_per_day", { value: Number(e.target.value), status: "answered" })} placeholder="cents per day" style={{ marginLeft: 8 }} /></label>
                  <p className="small" style={{ color: "#666" }}>Use customer&apos;s tariff rate if available.</p>
                </div>
              </>
            )}
            <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
              <label><strong>Skip Optional Circuit Breakdown</strong></label>
              <select value={energyEnhancedSkipCode} onChange={(e) => setAnswer("energy_v2.enhancedSkipReason.code", { value: e.target.value, status: "answered" })} style={{ maxWidth: 280 }}>
                <option value="">-- select --</option>
                <option value="time_insufficient">Time limited</option>
                <option value="customer_not_allowed">Customer declined</option>
                <option value="other">Other</option>
              </select>
              <p className="small" style={{ color: "#666" }}>If not performing detailed circuits, choose a reason.</p>
              <label>Skip note (optional): <input type="text" value={energyEnhancedSkipNote} onChange={(e) => setAnswer("energy_v2.enhancedSkipReason.note", { value: e.target.value, status: "answered" })} placeholder="optional note" style={{ marginLeft: 8 }} /></label>
            </div>
          </div>
          <div className="start-screen__actions">
            <button type="button" className="btn-primary start-screen__btn" onClick={goNext}>
              Next: Continue Inspection
            </button>
          </div>
        </div>
      )}

      {isSnapshotIntake && (
        <div className="wizard-page">
          <h1 className="wizard-page__title">Snapshot Intake (Optional)</h1>
          <p className="section-guidance">These optional questions help tailor your report recommendations. Ask only if customer is present.</p>
            <p className="small" style={{ marginBottom: 12 }}>These questions help diagnose your electrical usage and potential energy cost issues.</p>
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              <div>
                <label><strong>Customer Type</strong></label>
                <select value={snapshotOccupancy} onChange={(e) => setAnswer("snapshot_intake.occupancyType", { value: e.target.value, status: "answered" })} style={{ marginTop: 6, width: "100%" }}>
                  <option value="">Select</option>
                  <option value="investment">Investor</option>
                  <option value="owner_occupied">Homeowner</option>
                  <option value="tenant">Not sure</option>
                </select>
                <p className="small" style={{ marginTop: 4, color: "#666" }}>Choose what best describes the property owner.</p>
              </div>
              <div>
                <label><strong>Primary Goal</strong></label>
                <select value={snapshotPrimaryGoal} onChange={(e) => setAnswer("snapshot_intake.primaryGoal", { value: e.target.value, status: "answered" })} style={{ marginTop: 6, width: "100%" }}>
                  <option value="">Select</option>
                  <option value="reduce_risk">Risk focus</option>
                  <option value="reduce_bill">Energy focus</option>
                  <option value="plan_upgrade">Planning upgrade</option>
                  <option value="balanced">Balanced</option>
                </select>
                <p className="small" style={{ marginTop: 4, color: "#666" }}>What is the main concern for this inspection?</p>
              </div>
              <div>
                <label><strong>Installed systems (check all that apply)</strong></label>
                <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                  <label><input type="checkbox" checked={snapshotHasSolar} onChange={(e) => setAnswer("snapshot_intake.hasSolar", { value: e.target.checked, status: "answered" })} /> Solar PV</label>
                  <label><input type="checkbox" checked={snapshotHasBattery} onChange={(e) => setAnswer("snapshot_intake.hasBattery", { value: e.target.checked, status: "answered" })} /> Battery storage</label>
                  <label><input type="checkbox" checked={snapshotHasEv} onChange={(e) => setAnswer("snapshot_intake.hasEv", { value: e.target.checked, status: "answered" })} /> EV charger</label>
                </div>
                <p className="small" style={{ marginTop: 4, color: "#666" }}>Indicate which systems are present or planned.</p>
              </div>
              <div>
                <label><strong>Observed electrical issues</strong></label>
                <p className="small" style={{ marginTop: 2 }}>Select any symptoms seen or reported.</p>
                <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                  <label><input type="checkbox" checked={snapshotConcerns.includes("safety_uncertainty")} onChange={(e) => toggleConcern("safety_uncertainty", e.target.checked)} /> Frequent breaker tripping</label>
                  <label><input type="checkbox" checked={snapshotConcerns.includes("hot_switch")} onChange={(e) => toggleConcern("hot_switch", e.target.checked)} /> Main switch feels hot</label>
                  <label><input type="checkbox" checked={snapshotConcerns.includes("high_bill")} onChange={(e) => toggleConcern("high_bill", e.target.checked)} /> Sudden increase in bills</label>
                  <label><input type="checkbox" checked={snapshotConcerns.includes("upgrade_planning")} onChange={(e) => toggleConcern("upgrade_planning", e.target.checked)} /> Unsure where electricity is used</label>
                  <label><input type="checkbox" checked={snapshotConcerns.includes("other")} onChange={(e) => toggleConcern("other", e.target.checked)} /> Other</label>
                </div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <strong>E) Contact info (optional)</strong>
                <input type="text" placeholder="Name" value={String(getValue("snapshot_intake.contact.name") ?? "")} onChange={(e) => setAnswer("snapshot_intake.contact.name", { value: e.target.value, status: "answered" })} />
                <input type="text" placeholder="Phone" value={String(getValue("snapshot_intake.contact.phone") ?? "")} onChange={(e) => setAnswer("snapshot_intake.contact.phone", { value: e.target.value, status: "answered" })} />
                <input type="email" placeholder="Email" value={String(getValue("snapshot_intake.contact.email") ?? "")} onChange={(e) => setAnswer("snapshot_intake.contact.email", { value: e.target.value, status: "answered" })} />
                <input type="text" placeholder="Address" value={String(getValue("snapshot_intake.contact.address") ?? "")} onChange={(e) => setAnswer("snapshot_intake.contact.address", { value: e.target.value, status: "answered" })} />
              </div>
            </div>
          <div className="start-screen__actions">
            <button type="button" className="btn-primary start-screen__btn" onClick={goNext}>
              Next: Continue Inspection
            </button>
          </div>
        </div>
      )}

      {currentStep && !isJobClient && !isEnergyMainLoad && !isEnergyStress && !isEnergyEnhanced && !isSnapshotIntake && (
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

            {/* Page 2 – Safety Device Functional Tests (Switchboard & RCD): collapsible notes */}
            {currentPageIsSwitchboardRcd && (
              <details className="wizard-page__card" style={{ marginBottom: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Inspection Notes / Tips</summary>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee", fontSize: 14, color: "#444" }}>
                  <p><strong>Safety Device Functional Tests</strong> (RCD/GPO): Switchboard condition, RCD presence and testing, labelling and enclosure.</p>
                  <p style={{ marginTop: 8 }}>GPO (power points): test results by room; note any failures and add photos. Do not guess if not tested — record accurately or mark as not tested.</p>
                  <p style={{ marginTop: 8 }}>Photos: capture switchboard label, RCD test results, and any visible defects. Ensure good lighting and avoid glare.</p>
                </div>
              </details>
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

      {true && (
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
