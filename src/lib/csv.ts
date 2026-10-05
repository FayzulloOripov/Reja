import Papa from "papaparse";

export function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  return Papa.unparse(rows, { columns, quotes: false, newline: "\r\n" });
}

/** Trigger a file download in the browser (adds a UTF-8 BOM so Excel reads Uzbek letters). */
export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const bom = mime.startsWith("text/csv") ? "﻿" : "";
  const blob = new Blob([bom + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
