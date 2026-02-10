import { useState, useMemo } from "react";
import { getSections } from "../lib/fieldDictionary";
import { isSectionGatedOut, isSectionAutoSkipped } from "../lib/gates";
import { validateSection } from "../lib/validation";
import { useInspection, type IssueDetailsByField } from "../hooks/useInspection";
import { SectionForm } from "./SectionForm";
import { SectionPhotoEvidence } from "./SectionPhotoEvidence";
import { getWizardPages } from "../lib/inspectionBlocks";
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
  "S3B_LIGHTING_SWITCHES",
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
  S3B_LIGHTING_SWITCHES: "Inspect visible fittings, signs of heat damage, loose switches, and correct operation.",
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
      return `请为有问题的 GPO 房间「${label}」上传至少一张照片证据后再提交。`;
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
      return `请为有问题的灯具/开关房间「${label}」上传至少一张照片证据后再提交。`;
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
  } = useInspection();
  const [step, setStep] = useState(0);
  const [sectionErrors, setSectionErrors] = useState<Record<string, Record<string, string>>>({});

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

  /** 最后一步时：未通过完整性校验则禁止提交（必填项、有问题的房间需照片） */
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
      setServiceM8Error("请输入 ServiceM8 工作编号。");
      return;
    }
    if (jobNumber.length > 32) {
      setServiceM8Error("工作编号过长，请检查后重试。");
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
      let json: any;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || `Unexpected response (${res.status})`);
      }
      if (!res.ok || json?.ok === false) {
        const code = json?.error || `HTTP_${res.status}`;
        if (code === "JOB_NOT_FOUND") {
          throw new Error("未在 ServiceM8 中找到该工作编号。");
        }
        if (code === "SERVICE_M8_NOT_CONFIGURED") {
          throw new Error("ServiceM8 集成未配置，请在 Netlify 环境中设置相关密钥后重试。");
        }
        if (code === "INVALID_JOB_NUMBER") {
          throw new Error("无效的工作编号，请检查后重试。");
        }
        if (code === "UNAUTHORIZED") {
          throw new Error("预填接口未授权，请检查前端密钥配置。");
        }
        throw new Error(json?.details || json?.message || `ServiceM8 调用失败（${code}）`);
      }

      const job = json.job as {
        job_uuid: string;
        job_number: string;
        customer_name: string;
        contact_name?: string | null;
        phone?: string | null;
        email?: string | null;
        address?: {
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

      const addr = job.address || {};
      const fullAddress =
        addr.full_address ||
        addr.line1 ||
        [addr.suburb, addr.state, addr.postcode].filter(Boolean).join(", ") ||
        null;

      setServiceM8Summary({
        job_number: job.job_number,
        job_uuid: job.job_uuid,
        customer_name: job.customer_name,
        contact_name: job.contact_name ?? null,
        phone: job.phone ?? null,
        email: job.email ?? null,
        address_full: fullAddress,
        fetched_at: cacheInfo?.fetched_at ?? new Date().toISOString(),
        cache_hit: !!cacheInfo?.hit,
      });
    } catch (e) {
      setServiceM8Error((e as Error).message || "ServiceM8 预填失败，请稍后重试。");
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
            <h2 className="start-screen__brief-heading">给检测员</h2>
            <section className="start-screen__brief-section">
              <h3 className="start-screen__brief-label">任务</h3>
              <p className="start-screen__brief-text">按流程完成现场电气检查：室内房间 → 配电盘与 RCD → 屋顶空间 → 外部与收尾。逐项填写并拍照留证，有异常或选「Other」时请补充说明。</p>
            </section>
            <section className="start-screen__brief-section">
              <h3 className="start-screen__brief-label">目的</h3>
              <p className="start-screen__brief-text">为业主/投资人提供一份结构化的电气状况报告，用于风险评估与预算规划；报告将包含优先级、建议时间与 CapEx 区间。</p>
            </section>
            <section className="start-screen__brief-section">
              <h3 className="start-screen__brief-label">注意事项</h3>
              <ul className="start-screen__brief-list">
                <li>进入前先填物业地址与委托方，提交后获得 Inspection ID，后续可续传照片。</li>
                <li>RCD/GPO 等测试结果如实填写，未测项选「未测」勿猜填。</li>
                <li>每类问题尽量附 1–2 张照片，便于报告引用与客户理解。</li>
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
            <h2 className="start-screen__brief-heading">ServiceM8 预填（可选）</h2>
            <p className="start-screen__brief-text">
              若你手上只有 ServiceM8 工作编号（Job / Work Number），可在此查询客户信息并自动写入「委托方」字段；地址仍需在下方通过地址搜索选取，以确保包含 suburb / state / postcode。
            </p>
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={serviceM8JobNumber}
                onChange={(e) => setServiceM8JobNumber(e.target.value)}
                placeholder="输入 ServiceM8 Job / Work Number"
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
                {serviceM8Loading ? "查询中…" : "Fetch details"}
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
                  <strong>Customer / 委托方：</strong>
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
                  Data source: ServiceM8 {serviceM8Summary.cache_hit ? "(缓存命中)" : "(实时查询)"} ·{" "}
                  {new Date(serviceM8Summary.fetched_at).toLocaleString()}
                </p>
                <p style={{ marginTop: 4, fontSize: 12, color: "#777" }}>
                  提示：地址仍需在第一页表单中通过「Property address」搜索选择，以保证报告地址规范。
                </p>
              </div>
            )}
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
                      if (!r.ok) throw new Error("测试数据未生成。请先运行: npm run write-sample-payload");
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
                  {oneClickTestLoading ? "提交中…" : "一键测试（填充并提交 → 生成报告）"}
                </button>
                {oneClickTestError && (
                  <p className="validation-msg" style={{ marginTop: 8 }}>
                    {oneClickTestError}
                  </p>
                )}
              </div>
            )}

            {/* Submit / section errors：缺照片等完整性未通过时禁止提交并提示 */}
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
