export type StoredInspection = {
  inspection_id: string;
  raw: Record<string, unknown>;
  report_html: string;
  findings: Array<{ id: string; priority: string; title?: string }>;
  limitations: string[];
};

const store = new Map<string, StoredInspection>();

export function save(id: string, data: StoredInspection): void {
  store.set(id, data);
}

export function get(id: string): StoredInspection | undefined {
  return store.get(id);
}
