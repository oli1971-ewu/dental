/**
 * Universal dd-mm-yyyy date and date-time formatting helpers.
 */

export function formatDateDDMMYYYY(
  raw?: string | Date | null,
  fallback = '-'
): string {
  if (raw === null || raw === undefined) return fallback;

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return fallback;
    const d = String(raw.getDate()).padStart(2, '0');
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const y = raw.getFullYear();
    return `${d}-${m}-${y}`;
  }

  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '-') return fallback;

  // Match YYYY-MM-DD or YYYY/MM/DD (with optional trailing time)
  const isoMatch = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }

  // Match DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    return `${dmyMatch[1]}-${dmyMatch[2]}-${dmyMatch[3]}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const y = parsed.getFullYear();
    return `${d}-${m}-${y}`;
  }

  return trimmed;
}

export function formatDateTimeDDMMYYYY(
  raw?: string | Date | null,
  fallback = '-'
): string {
  if (raw === null || raw === undefined) return fallback;
  const parsed = raw instanceof Date ? raw : new Date(String(raw).trim());
  if (isNaN(parsed.getTime())) {
    return formatDateDDMMYYYY(raw, fallback);
  }
  const d = String(parsed.getDate()).padStart(2, '0');
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const y = parsed.getFullYear();
  const timeStr = parsed.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${d}-${m}-${y}, ${timeStr}`;
}
