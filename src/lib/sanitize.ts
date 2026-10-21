const HTML_TAG = /<\/?[a-z!][^>]*>/gi;
// Control characters, plus bidi overrides that can disguise text (e.g. "Trojan Source").
const CONTROL = /[\p{Cc}‪-‮⁦-⁩]/gu;

/**
 * Cleans a user-supplied title before it is stored (REQ-NFR-SEC1): Unicode-normalized,
 * markup and stray angle brackets removed, control characters replaced, whitespace
 * collapsed. SQL injection is handled separately by parameterized queries, so
 * quotes and SQL keywords are left intact. React escapes text on output as well.
 */
export function sanitizeTitle(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(HTML_TAG, "")
    .replace(/[<>]/g, " ")
    .replace(CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim();
}
