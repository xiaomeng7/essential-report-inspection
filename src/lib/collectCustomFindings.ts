/**
 * Collect custom "other" findings from gpo_tests.rooms and lighting.rooms.
 * These require 7 dimensions to be filled before submit.
 */

import type { CustomFindingInput } from "../components/CustomFindingsModal";

const ROOM_TYPE_LABELS: Record<string, string> = {
  bedroom_1: "Bedroom 1",
  bedroom_2: "Bedroom 2",
  bedroom_3: "Bedroom 3",
  bedroom_4: "Bedroom 4",
  living_room: "Living Room",
  dining_room: "Dining Room",
  kitchen: "Kitchen",
  bathroom_1: "Bathroom 1",
  bathroom_2: "Bathroom 2",
  laundry: "Laundry",
  garage: "Garage",
  shed: "Shed",
  veranda: "Veranda",
  balcony: "Balcony",
  hallway: "Hallway",
  office: "Office",
  storeroom: "Storeroom",
  external_area: "External Area",
  other: "Other",
};

function roomLabel(room: Record<string, unknown>): string {
  const rt = (room.room_type as string) || "";
  const custom = (room.room_name_custom as string) || "";
  if (rt === "other" && custom) return custom;
  return ROOM_TYPE_LABELS[rt] || rt.replace(/_/g, " ") || "Room";
}

function createEmptyFinding(id: string, title: string, source: "gpo" | "lighting", roomLabel?: string): CustomFindingInput {
  return {
    id,
    title,
    source,
    roomLabel,
    safety: "",
    urgency: "",
    liability: "",
    budget_low: "",
    budget_high: "",
    priority: "",
    severity: "",
    likelihood: "",
    escalation: "",
  };
}

/**
 * Collect custom "other" findings from state. Uses getValue to extract from Answer wrappers.
 */
export function collectCustomOtherFindings(getValue: (key: string) => unknown): CustomFindingInput[] {
  const out: CustomFindingInput[] = [];
  let customIdx = 0;

  const gpoRooms = getValue("gpo_tests.rooms") as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(gpoRooms)) {
    for (let i = 0; i < gpoRooms.length; i++) {
      const r = gpoRooms[i];
      if (r?.room_access === "not_accessible") continue;
      const issue = (r?.issue as string) || "";
      if (issue !== "other") continue;
      const title = ((r?.issue_other as string) || "").trim() || "Custom issue (GPO)";
      customIdx++;
      out.push(createEmptyFinding(`CUSTOM_GPO_${i}_${customIdx}`, title, "gpo", roomLabel(r)));
    }
  }

  const lightingRooms = getValue("lighting.rooms") as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(lightingRooms)) {
    for (let i = 0; i < lightingRooms.length; i++) {
      const r = lightingRooms[i];
      if (r?.room_access === "not_accessible") continue;
      const issues = (r?.issues as string[]) || [];
      if (!issues.includes("other")) continue;
      const title = ((r?.issue_other as string) || "").trim() || "Custom issue (Lighting/Switch)";
      customIdx++;
      out.push(createEmptyFinding(`CUSTOM_LIGHTING_${i}_${customIdx}`, title, "lighting", roomLabel(r)));
    }
  }

  return out;
}
