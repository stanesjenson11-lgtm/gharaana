// RFC 4180 CSV, as Excel and Google Sheets save it: quoted fields may hold commas, quotes ("") and line breaks.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, ""); // Excel's byte-order mark
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') field += s[++i];
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((f) => f.trim()));
}

export const toCsv = (rows: string[][]) => rows.map((r) => r.map((f) => (/[",\n\r]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(",")).join("\r\n");
