// Spreadsheet apps evaluate CSV cells starting with these characters as
// formulas (CSV/formula injection, OWASP). Participant input is untrusted.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function sanitizeCsvCell<T>(value: T): T | string {
  if (typeof value !== 'string' || value === '-' || !FORMULA_TRIGGER.test(value)) {
    return value;
  }
  return `'${value}`;
}

export function sanitizeCsvRow<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    clean[key] = sanitizeCsvCell(value);
  }
  return clean;
}

/**
 * Serializes rows into RFC 4180 compliant CSV string with quotation and escaping.
 */
export function generateCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeCell).join(',');
  const lines = rows.map((row) => headers.map((h) => escapeCell(row[h])).join(','));
  return [headerLine, ...lines].join('\r\n');
}

/**
 * Triggers a client-side download of a CSV file with UTF-8 BOM.
 */
export function downloadCsv(fileName: string, rows: Record<string, unknown>[]): void {
  const csvContent = generateCsv(rows);
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers a client-side download of an XLSX spreadsheet without xlsx security vulnerabilities.
 */
export async function downloadExcel(
  fileName: string,
  rows: Record<string, unknown>[],
  sheetName = 'Pendaftar'
): Promise<void> {
  if (rows.length === 0) return;

  const writeXlsxFile = (await import('write-excel-file/browser')).default;
  const headers = Object.keys(rows[0]);
  const headerRow = headers.map((h) => ({
    value: h,
    fontWeight: 'bold' as const,
  }));

  const dataRows = rows.map((row) =>
    headers.map((h) => {
      const val = row[h];
      if (typeof val === 'number') {
        return { value: val, type: Number };
      }
      if (typeof val === 'boolean') {
        return { value: val, type: Boolean };
      }
      if (val instanceof Date) {
        return { value: val, type: Date };
      }
      return {
        value: val === null || val === undefined ? '-' : String(val),
        type: String,
      };
    })
  );

  await writeXlsxFile([headerRow, ...dataRows], {
    sheet: sheetName,
  }).toFile(fileName);
}

