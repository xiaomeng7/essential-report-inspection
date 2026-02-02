/**
 * Logical blocks for inspection flow: technician fills one block at a time
 * (e.g. Meter Box → main switch, consumer main, earthing, RCD) to avoid running around.
 */

export type BlockDef = {
  id: string;
  title: string;
  titleEn: string;
  sectionIds: string[];
};

/** Block order and grouping; aligned with PDF On-Site Technical Checklist. */
export const INSPECTION_BLOCKS: BlockDef[] = [
  { id: "context", title: "房产信息", titleEn: "Property Information", sectionIds: ["S0_START_CONTEXT"] },
  { id: "access", title: "进入与限制", titleEn: "Access & Limitations", sectionIds: ["S1_ACCESS_LIMITATIONS"] },
  {
    id: "supply_distribution",
    title: "供电与配电",
    titleEn: "Supply & Distribution",
    sectionIds: [
      "S2_SUPPLY_OVERVIEW",
      "S2_MAIN_SWITCH",
      "S2_SWITCHBOARD_OVERVIEW",
      "S3_SWITCHBOARD_CAPACITY_LABELS",
      "S4_EARTHING_MEN",
      "S4_CABLES_LEGACY",
    ],
  },
  { id: "rcd", title: "RCD 测试", titleEn: "RCD Tests", sectionIds: ["S5_RCD_TESTS_SUMMARY", "S6_RCD_TESTS_EXCEPTIONS"] },
  { id: "gpo_lighting", title: "GPO 与照明", titleEn: "GPO & Lighting", sectionIds: ["S7A_GPO_BY_ROOM", "S8_GPO_LIGHTING_EXCEPTIONS", "S7B_LIGHTING_BY_ROOM"] },
  {
    id: "internal_installation",
    title: "室内安装",
    titleEn: "Internal Installation",
    sectionIds: [
      "S3B_LIGHTING_SWITCHES",
      "S3C_KITCHEN",
      "S3D_BATHROOMS",
      "S3E_LAUNDRY",
      "S3F_ROOF_SPACE",
      "S3G_EXTERIOR_GARAGE",
      "S3H_SMOKE_ALARMS",
      "S3I_GENERAL_OBSERVATIONS",
    ],
  },
  { id: "assets", title: "可再生能源与高负荷", titleEn: "Renewable & High-Load", sectionIds: ["S9_SOLAR_BATTERY_EV", "S9B_POOL_HIGH_LOAD"] },
  { id: "measured", title: "测量与测试数据", titleEn: "Measured & Test Data", sectionIds: ["S5A_MEASURED_DATA"] },
  { id: "exceptions", title: "例外与客户陈述", titleEn: "Exceptions & Client Statements", sectionIds: ["S6_EXCEPTIONS_COMPLETION"] },
  { id: "signoff", title: "签字确认", titleEn: "Sign-off", sectionIds: ["S10_SIGNOFF"] },
];

export function getBlocks() {
  return INSPECTION_BLOCKS;
}

export function getBlockForSection(sectionId: string): BlockDef | undefined {
  return INSPECTION_BLOCKS.find((b) => b.sectionIds.includes(sectionId));
}
