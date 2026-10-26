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
