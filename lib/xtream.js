// Shared Xtream Codes API response validation.
// Imported by serverless functions in /api.
// The credential checker (credential-checker/index.html) inlines a copy —
// keep both in sync when changing this file.

/**
 * Parse and validate a player_api.php response.
 * Returns { ok, account } on success or { ok, reason } on failure.
 *
 * Handles:
 *   - auth:0 / auth:"0"  — credentials rejected
 *   - user_info absent   — non-Xtream server or hard error
 *   - user_info present but no username — partial/malformed response
 *   - status normalization (active / expired / disabled / banned)
 *   - exp_date as Unix timestamp string or null/"0"
 */
export function parseXtreamAuth(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'Invalid response format (not JSON)' };
  }

  const ui = data.user_info;

  if (!ui || typeof ui !== 'object') {
    return { ok: false, reason: 'No user_info in response' };
  }

  // auth:0 (or "0") = explicitly rejected
  if (ui.auth === 0 || ui.auth === '0' || ui.auth === false) {
    return { ok: false, reason: 'Credentials rejected (auth:0)' };
  }

  // A real successful response always includes username
  if (!ui.username) {
    return { ok: false, reason: 'Incomplete response (missing username)' };
  }

  const status = normalizeStatus(ui.status);
  const expDate = normalizeExpDate(ui.exp_date);
  const maxConnections = ui.max_connections != null
    ? parseInt(ui.max_connections, 10)
    : null;
  const formats = Array.isArray(ui.allowed_output_formats)
    ? ui.allowed_output_formats
    : [];

  return {
    ok: true,
    account: { status, maxConnections, formats, expDate },
  };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const INACTIVE_STATUSES = new Set(['expired', 'disabled', 'banned', 'suspended', 'inactive']);

export function isAccountActive(status) {
  if (!status) return false;
  return !INACTIVE_STATUSES.has(status.toLowerCase());
}

function normalizeStatus(status) {
  if (!status) return 'unknown';
  return String(status).toLowerCase(); // 'active' | 'expired' | 'disabled' | 'banned' | ...
}

function normalizeExpDate(expDate) {
  if (!expDate || expDate === '0' || expDate === 0) return null;
  const s = String(expDate);
  // Unix timestamp (all digits)
  if (/^\d{9,11}$/.test(s)) {
    return new Date(parseInt(s, 10) * 1000).toISOString();
  }
  return s;
}
