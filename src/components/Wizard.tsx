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
]);

type VisibleStep = { pageId: string; pageTitle: string; sectionIds: string[] };

type Props = { onSubmitted: (inspectionId: string, address?: string, technicianName?: string) => void };

export function Wizard({ onSubmitted }: Props) {
  const [oneClickTestLoading, setOneClickTestLoading] = useState(false);
  const [oneClickTestError, setOneClickTestError] = useState<string | null>(null);
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

  const currentStep = visibleSteps[step];
  const isFirst = step === 0;
  const isLast = step === visibleSteps.length - 1;
  const progress = visibleSteps.length ? ((step + 1) / visibleSteps.length) * 100 : 0;

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
      submitInspection();
      return;
    }
    setStep((s) => Math.min(s + 1, visibleSteps.length - 1));
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

  return (
    <div className="app">
      <div className="progress-wrap">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="progress-text">
          Page {step + 1} of {visibleSteps.length}: {currentStep?.pageTitle ?? ""}
        </p>
      </div>

      {currentStep && (
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

            {/* Submit / section errors */}
            {currentStep.sectionIds.some((id) => sectionErrors[id]?._submit) && (
              <div className="wizard-page__card">
                <p className="validation-msg">
                  {currentStep.sectionIds.map((id) => sectionErrors[id]?._submit).filter(Boolean)[0]}
                </p>
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

      <div className="actions">
        <button type="button" className="btn-secondary" onClick={goBack} disabled={isFirst}>
          Back
        </button>
        <button type="button" className="btn-primary" onClick={goNext}>
          {isLast ? "Submit Inspection" : "Next"}
        </button>
      </div>
    </div>
  );
}
