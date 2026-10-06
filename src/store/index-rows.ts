import { PK, type StoreData, type TableName } from "./tables";

/** Key rows by their primary key, per table (the store's shape). */
export function indexRows(rows: Record<string, Record<string, unknown>[]>): Partial<StoreData> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [table, list] of Object.entries(rows)) {
    const pk = PK[table as TableName];
    const map: Record<string, unknown> = {};
    for (const r of list) map[pk.map((c) => String(r[c])).join("|")] = r;
    out[table] = map;
  }
  return out as Partial<StoreData>;
}
