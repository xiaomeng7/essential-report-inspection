import fieldDictionaryJson from "../../FIELD_DICTIONARY.json";

export type FieldDef = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  required_when?: string;
  skippable?: boolean;
  enum?: string;
  enum_values?: string[];
  min?: number;
  max?: number;
  item_schema?: Record<string, { type: string; enum?: string; enum_values?: string[]; required?: boolean; min?: number; max?: number; label?: string }>;
  ui: string;
  /** Helper text shown below label (e.g. for GPO exceptions: "When pass count < total tested...") */
  helper_text?: string;
  /** When true/yes is selected, expand sub-form to capture location, photo, notes */
  on_issue_capture?: boolean;
};

export type GateDef = {
  depends_on: string;
  equals: unknown;
  on_false: { section_status: string; skip_reason: string };
};

export type SectionDef = {
  id: string;
  title: string;
  status_field?: string;
  gates?: GateDef[];
  fields: FieldDef[];
  clear_on_gate_change?: Array<{ if_changed: string; from: boolean; to: boolean; clear_paths: string[] }>;
  section_auto_skip?: {
    when: string;
    set: { status: string; skip_reason: string };
    clear_paths: string[];
  };
};

export type FieldDictionary = {
  version: string;
  enums: Record<string, string[]>;
  sections: SectionDef[];
};

const dict = fieldDictionaryJson as FieldDictionary;

export function getFieldDictionary(): FieldDictionary {
  return dict;
}

export function getSections(): SectionDef[] {
  return dict.sections;
}

export function getEnums(): Record<string, string[]> {
  return dict.enums;
}

export function getEnum(name: string): string[] {
  return dict.enums[name] ?? [];
}

export function getSkipReasons(): string[] {
  return dict.enums.skip_reason ?? [];
}
