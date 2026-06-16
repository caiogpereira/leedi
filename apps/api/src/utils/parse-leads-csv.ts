import Papa from 'papaparse';

/**
 * A successfully parsed CSV row, ready for insertion.
 * `telefone` is always normalized to E.164 (e.g. "+5511999999999").
 */
export interface ParsedRow {
  telefone: string;
  nome?: string;
  email?: string;
}

/**
 * A row that could not be imported, with a human-readable (pt-BR) reason.
 * `index` is the 0-based position among data rows (header excluded).
 * `raw` is the original telefone cell value (no other PII is retained).
 */
export interface ErrorRow {
  index: number;
  raw: string;
  reason: string;
}

export interface ParseLeadsCsvResult {
  valid: ParsedRow[];
  errors: ErrorRow[];
  /**
   * In-file duplicate phones (a normalized telefone already seen in an earlier
   * row). These are NOT errors — per AC#5 the first occurrence is imported and
   * each later occurrence is counted as a duplicate, alongside DB conflicts.
   */
  duplicates: ErrorRow[];
}

/**
 * Thrown when the CSV is structurally unusable — currently only when the
 * required `telefone` column is absent. The message is surfaced to the user.
 */
export class CsvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvValidationError';
  }
}

const MISSING_TELEFONE_COLUMN =
  "Coluna 'telefone' obrigatória não encontrada no arquivo.";
const INVALID_PHONE = 'Telefone inválido';
const DUPLICATE_IN_FILE = 'Telefone duplicado no arquivo';

// E.164: leading + followed by 10–15 digits.
const E164_RE = /^\+\d{10,15}$/;

/**
 * Normalizes a raw phone cell to E.164, applying Brazil-friendly heuristics.
 *
 * Rules (in order):
 *  - Strip every non-digit character.
 *  - 11 digits, not starting with "55"  -> assume local BR (DDD + mobile), prefix "+55".
 *  - 10 digits, not starting with "55"  -> assume local BR (DDD + landline), prefix "+55".
 *    Without this, a 10-digit landline falls through to the catch-all and becomes
 *    "+1…" (read as NANP / US-Canada) — silent wrong-country corruption (F-06).
 *  - 12 or 13 digits starting with "55" -> already has country code, prefix "+".
 *  - Otherwise treat the digits as already-international and prefix "+".
 *
 * Returns null when the result is not valid E.164.
 */
function normalizeToE164(rawValue: string): string | null {
  const digits = rawValue.replace(/\D/g, '');
  if (digits.length === 0) return null;

  let candidate: string;
  if (digits.length === 11 && !digits.startsWith('55')) {
    // Typical BR mobile entered without country code: DD + 9 digits.
    candidate = `+55${digits}`;
  } else if (digits.length === 10 && !digits.startsWith('55')) {
    // BR landline entered without country code: DD + 8 digits. Must come before
    // the catch-all, which would otherwise produce "+1…" (NANP) — see F-06.
    candidate = `+55${digits}`;
  } else if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    candidate = `+${digits}`;
  } else {
    candidate = `+${digits}`;
  }

  return E164_RE.test(candidate) ? candidate : null;
}

function pickHeaders(meta: Papa.ParseMeta): string[] {
  return (meta.fields ?? []).map((f) => f.trim().toLowerCase());
}

function cellValue(row: Record<string, unknown>, key: string): string {
  // papaparse keys preserve the original header casing/spacing; we resolve
  // case-insensitively so "Telefone" / "TELEFONE" / "telefone" all work.
  const matchKey = Object.keys(row).find((k) => k.trim().toLowerCase() === key);
  if (!matchKey) return '';
  const value = row[matchKey];
  return value == null ? '' : String(value).trim();
}

/**
 * Parses a CSV string into valid rows + per-row errors.
 *
 * Required column: `telefone`. Optional: `nome`, `email`.
 * Throws {@link CsvValidationError} when the `telefone` column is missing.
 *
 * In-file duplicate phones: the first occurrence is kept (in `valid`); each
 * later occurrence goes into `duplicates` (NOT `errors`), so the caller can fold
 * them into the duplicate count per AC#5. Malformed phones go into `errors`.
 *
 * LGPD: this function never logs cell contents. Callers should log counts and
 * row indices only.
 */
export function parseLeadsCsv(content: string): ParseLeadsCsvResult {
  const parsed = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = pickHeaders(parsed.meta);
  if (!headers.includes('telefone')) {
    throw new CsvValidationError(MISSING_TELEFONE_COLUMN);
  }

  const valid: ParsedRow[] = [];
  const errors: ErrorRow[] = [];
  const duplicates: ErrorRow[] = [];
  const seen = new Set<string>();

  parsed.data.forEach((row, index) => {
    const rawTelefone = cellValue(row, 'telefone');
    const normalized = normalizeToE164(rawTelefone);

    if (!normalized) {
      errors.push({ index, raw: rawTelefone, reason: INVALID_PHONE });
      return;
    }

    if (seen.has(normalized)) {
      duplicates.push({ index, raw: rawTelefone, reason: DUPLICATE_IN_FILE });
      return;
    }
    seen.add(normalized);

    const nome = cellValue(row, 'nome');
    const email = cellValue(row, 'email');

    const parsedRow: ParsedRow = { telefone: normalized };
    if (nome) parsedRow.nome = nome;
    if (email) parsedRow.email = email;

    valid.push(parsedRow);
  });

  return { valid, errors, duplicates };
}
