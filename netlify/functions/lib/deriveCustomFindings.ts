/**
 * Derive custom "other" findings from raw inspection data (gpo_tests.rooms, lighting.rooms).
 * These need 7 dimensions filled by the backend engineer (not technician).
 * Location and photo_ids are derived from the room data (engineer does not fill these).
 */

export type CustomFindingPending = {
  id: string;
  title: string;
  source: "gpo" | "lighting";
  roomLabel?: string;
};

function extractValue(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    const answerValue = (v as { value: unknown }).value;
    if (typeof answerValue === "object" && answerValue !== null && "value" in (answerValue as object)) {
      return extractValue(answerValue);
    }
    return answerValue;
  }
  return v;
}

function roomLabel(room: Record<string, unknown>): string {
  const rt = String(room.room_type || "").trim();
  const custom = String(room.room_name_custom || "").trim();
  if (rt === "other" && custom) return custom;
  const labels: Record<string, string> = {
    bedroom_1: "Bedroom 1", bedroom_2: "Bedroom 2", living_room: "Living Room", kitchen: "Kitchen",
    bathroom_1: "Bathroom 1", garage: "Garage", shed: "Shed", veranda: "Veranda", hallway: "Hallway",
    office: "Office", external_area: "External Area", other: "Other",
  };
  return labels[rt] || rt.replace(/_/g, " ") || "Room";
}

/**
 * Derive custom findings pending (need 7 dimensions from engineer) from raw.
 * Excludes those already in raw.custom_findings_completed.
 */
export function deriveCustomFindingsPending(raw: Record<string, unknown>): CustomFindingPending[] {
  const out: CustomFindingPending[] = [];
  const completed = (raw.custom_findings_completed as Array<{ id: string }>) ?? [];
  const completedIds = new Set(completed.map((c) => c.id));
  let idx = 0;

  const gpoTests = extractValue(raw.gpo_tests) as Record<string, unknown> | undefined;
  const gpoRooms = gpoTests?.rooms;
  const rooms = Array.isArray(gpoRooms) ? gpoRooms : (extractValue(gpoRooms) as Array<Record<string, unknown>> | undefined);
  if (Array.isArray(rooms)) {
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      const access = extractValue(r?.room_access) as string;
      if (access === "not_accessible") continue;
      const issue = extractValue(r?.issue) as string;
      if (issue !== "other") continue;
      const title = String(extractValue(r?.issue_other) || "").trim() || "自定义问题 (GPO)";
      const id = `CUSTOM_GPO_${i}_${idx}`;
      idx++;
      if (!completedIds.has(id)) {
        out.push({ id, title, source: "gpo", roomLabel: roomLabel(r as Record<string, unknown>) });
      }
    }
  }

  const lighting = extractValue(raw.lighting) as Record<string, unknown> | undefined;
  const lightingRoomsRaw = lighting?.rooms;
  const lightingRooms = Array.isArray(lightingRoomsRaw) ? lightingRoomsRaw : (extractValue(lightingRoomsRaw) as Array<Record<string, unknown>> | undefined);
  if (Array.isArray(lightingRooms)) {
    for (let i = 0; i < lightingRooms.length; i++) {
      const r = lightingRooms[i] as Record<string, unknown>;
      const access = extractValue(r?.room_access) as string;
      if (access === "not_accessible") continue;
      const issues = extractValue(r?.issues) as string[] | undefined;
      if (!Array.isArray(issues) || !issues.includes("other")) continue;
      const title = String(extractValue(r?.issue_other) || "").trim() || "自定义问题 (灯具/开关)";
      const id = `CUSTOM_LIGHTING_${i}_${idx}`;
      idx++;
      if (!completedIds.has(id)) {
        out.push({ id, title, source: "lighting", roomLabel: roomLabel(r as Record<string, unknown>) });
      }
    }
  }

  return out;
}

/**
 * Get location and photo_ids from raw for a custom finding by parsing its id.
 * Id format: CUSTOM_GPO_{roomIndex}_{counter} or CUSTOM_LIGHTING_{roomIndex}_{counter}
 */
export function getRoomLocationAndPhotos(raw: Record<string, unknown>, findingId: string): { location: string; photo_ids: string[] } {
  const defaultResult = { location: "", photo_ids: [] };
  const gpoMatch = /^CUSTOM_GPO_(\d+)_\d+$/.exec(findingId);
  const lightingMatch = /^CUSTOM_LIGHTING_(\d+)_\d+$/.exec(findingId);

  if (gpoMatch) {
    const roomIndex = parseInt(gpoMatch[1], 10);
    const gpoTests = extractValue(raw.gpo_tests) as Record<string, unknown> | undefined;
    const gpoRooms = gpoTests?.rooms;
    const rooms = Array.isArray(gpoRooms) ? gpoRooms : (extractValue(gpoRooms) as Array<Record<string, unknown>> | undefined);
    if (!Array.isArray(rooms) || !rooms[roomIndex]) return defaultResult;
    const r = rooms[roomIndex] as Record<string, unknown>;
    const loc = roomLabel(r);
    const pids = Array.isArray(r?.photo_ids) ? (r.photo_ids as string[]).filter((x): x is string => typeof x === "string") : [];
    return { location: loc, photo_ids: pids };
  }

  if (lightingMatch) {
    const roomIndex = parseInt(lightingMatch[1], 10);
    const lighting = extractValue(raw.lighting) as Record<string, unknown> | undefined;
    const lightingRoomsRaw = lighting?.rooms;
    const lightingRooms = Array.isArray(lightingRoomsRaw) ? lightingRoomsRaw : (extractValue(lightingRoomsRaw) as Array<Record<string, unknown>> | undefined);
    if (!Array.isArray(lightingRooms) || !lightingRooms[roomIndex]) return defaultResult;
    const r = lightingRooms[roomIndex] as Record<string, unknown>;
    const loc = roomLabel(r);
    const pids = Array.isArray(r?.photo_ids) ? (r.photo_ids as string[]).filter((x): x is string => typeof x === "string") : [];
    return { location: loc, photo_ids: pids };
  }

  return defaultResult;
}
