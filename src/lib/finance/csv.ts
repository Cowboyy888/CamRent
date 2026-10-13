/**
 * CSV for spreadsheet users. Cells that a spreadsheet would treat as a formula
 * (= + - @ or a tab/CR first) are prefixed with an apostrophe so exported
 * free text can never execute (CSV injection). Numbers are written plainly.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" || typeof value === "bigint" ? String(value) : String(value);
  const isNumber = typeof value === "number" || typeof value === "bigint";
  if (!isNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(","));
  // Excel needs a BOM to read UTF-8 (Khmer, Chinese) correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}
