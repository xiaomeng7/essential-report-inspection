import { useState, useMemo } from "react";
import { getSections } from "../lib/fieldDictionary";
import { isSectionGatedOut, isSectionAutoSkipped } from "../lib/gates";
import { validateSection } from "../lib/validation";
import { useInspection, type IssueDetailsByField } from "../hooks/useInspection";
import { SectionForm } from "./SectionForm";
import { SectionPhotoEvidence } from "./SectionPhotoEvidence";
import { getBlockForSection } from "../lib/inspectionBlocks";
import { assignStagedPhotosToFindings } from "../lib/sectionToFindingsMap";
import { uploadInspectionPhoto } from "../lib/uploadInspectionPhotoApi";
import { getFindingForField } from "../lib/fieldToFindingMap";

const GATE_KEYS = new Set([
  "rcd_tests.performed",
  "gpo_tests.performed",
  "assets.has_solar_pv",
  "assets.has_battery",
  "assets.has_ev_charger",
]);

/** Sections that have a photo evidence block below the form. S7A/S7B omit it: photos are captured in the room table. */
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
  "S3A_POWER_POINTS",
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

type Props = { onSubmitted: (inspectionId: string, address?: string, technicianName?: string) => void };

export function Wizard({ onSubmitted }: Props) {
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
  const visibleSections = useMemo(() => {
    return sections.filter((s) => !isSectionGatedOut(s.id, state) && !isSectionAutoSkipped(s.id, state));
  }, [sections, state]);

  const current = visibleSections[step];
  const isFirst = step === 0;
  const isLast = step === visibleSections.length - 1;
  const progress = visibleSections.length ? ((step + 1) / visibleSections.length) * 100 : 0;

  const goNext = () => {
    if (!current) return;
    const { valid, errors } = validateSection(current.id, state);
    if (!valid) {
      // Debug: log validation errors
      console.log("Validation errors:", errors);
      console.log("Current state:", JSON.stringify(state, null, 2));
      console.log("Current section:", current.id);
      setSectionErrors((prev) => ({ ...prev, [current.id]: errors }));
      // Scroll to top to show validation errors
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSectionErrors((prev) => {
      const next = { ...prev };
      delete next[current.id];
      return next;
    });
    if (isLast) {
      submitInspection();
      return;
    }
    setStep((s) => Math.min(s + 1, visibleSections.length - 1));
    // Scroll to top when navigating to next section
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setStep((s) => Math.max(0, s - 1));
    // Scroll to top when navigating to previous section
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitInspection = async () => {
    const { _staged_photos, _issue_details, ...rest } = state as Record<string, unknown>;
    // Include _issue_details (without photos) in payload for backend storage
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

      // Get findings from server to know which ones were created
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

      // Upload issue detail photos (each field → finding mapping)
      for (const [fieldKey, detail] of Object.entries(issueDetails)) {
        if (!detail?.photo_ids?.length) continue;
        const findingId = getFindingForField(fieldKey);
        if (!findingId) {
          console.warn(`No finding mapping for field: ${fieldKey}`);
          continue;
        }
        // Only upload if this finding was actually created
        if (!findingIds.includes(findingId)) {
          console.warn(`Finding ${findingId} not in inspection, skipping photos for ${fieldKey}`);
          continue;
        }
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

      // Upload staged section photos (legacy flow)
      const stagedBySection = (typeof _staged_photos === "object" && _staged_photos !== null && !Array.isArray(_staged_photos))
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
      setSectionErrors((prev) => ({
        ...prev,
        [current!.id]: { _submit: (e as Error).message },
      }));
    }
  };

  return (
    <div className="app">
      <div className="progress-wrap">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="progress-text">
          Section {step + 1} of {visibleSections.length}
        </p>
      </div>

      {current && (
        <>
          {/* Block title when section belongs to a logical block */}
          {getBlockForSection(current.id) && (
            <div style={{ margin: "12px 12px 0", fontSize: 12, color: "var(--text-muted)" }}>
              {getBlockForSection(current.id)?.title} → {current.title}
            </div>
          )}
          {(sectionErrors[current.id]?._submit) && (
            <div className="section" style={{ margin: 12 }}>
              <p className="validation-msg">{sectionErrors[current.id]._submit}</p>
            </div>
          )}
          <SectionForm
            section={current}
            state={state}
            setAnswer={setAnswer}
            setAnswerWithGateCheck={setAnswerWithGateCheck}
            getValue={getValue}
            getAnswer={getAnswer}
            errors={sectionErrors[current.id] ?? {}}
            gateKeys={GATE_KEYS}
            getIssueDetail={getIssueDetail}
            setIssueDetail={setIssueDetail}
          />
          {SECTIONS_WITH_PHOTOS.has(current.id) && (
            <SectionPhotoEvidence
              sectionId={current.id}
              sectionTitle={current.title}
              photos={getStagedPhotos()[current.id] ?? []}
              onAddPhoto={addStagedPhoto}
              onRemovePhoto={removeStagedPhoto}
              onUpdateCaption={updateStagedPhotoCaption}
            />
          )}
        </>
      )}

      <div className="actions">
        <button type="button" className="btn-secondary" onClick={goBack} disabled={isFirst}>
          Back
        </button>
        {!isLast && (
          <button type="button" className="btn-secondary" onClick={() => {}}>
            Save Draft
          </button>
        )}
        <button type="button" className="btn-primary" onClick={goNext}>
          {isLast ? "Submit Inspection" : "Next"}
        </button>
      </div>
    </div>
  );
}

