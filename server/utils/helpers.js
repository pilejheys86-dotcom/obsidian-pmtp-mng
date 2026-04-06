/**
 * Generate a unique receipt number: RCP-YYYYMMDD-XXXXX
 */
const generateReceiptNumber = () => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `RCP-${y}${m}${d}-${rand}`;
};

/**
 * Generate a ticket number: TKT-YYYYMM-XXXXX
 */
const generateTicketNumber = () => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `TKT-${y}${m}-${rand}`;
};

/**
 * Standard paginated query helper.
 * Returns { from, to } for Supabase .range()
 */

const getPagination = (page = 1, limit = 10) => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { from, to, limit };
};

/**
 * Sanitize search input for Supabase PostgREST .or() / .ilike() queries.
 * Strips characters that could manipulate filter syntax.
 */
const sanitizeSearch = (input) => {
  if (!input || typeof input !== 'string') return '';
  // Remove PostgREST filter operators and special chars
  return input.replace(/[%_().,\\]/g, '').trim().slice(0, 100);
};

/**
 * Build a combined search filter string for Supabase .or().
 * Uses ILIKE for short queries (prefix matching) and PostgreSQL full-text
 * search (plainto_tsquery — equivalent to FREETEXT) for longer queries.
 *
 * @param {string} search - Raw search input
 * @param {string[]} columns - Column names to search across
 * @returns {string|null} - PostgREST .or() filter string, or null if empty
 */
const buildSearchFilter = (search, columns) => {
  const s = sanitizeSearch(search);
  if (!s) return null;

  // ILIKE for partial / prefix matching
  const ilikeFilters = columns.map(col => `${col}.ilike.%${s}%`);

  // For 3+ character queries, also add full-text search (plainto_tsquery)
  // This handles natural language queries, word stemming, and relevance
  if (s.length >= 3) {
    const ftsFilters = columns.map(col => `${col}.plfts.${s}`);
    return [...ilikeFilters, ...ftsFilters].join(',');
  }

  return ilikeFilters.join(',');
};

/**
 * Validate UUID format.
 */
const isValidUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

/**
 * Generate a temporary password: Obs-XXXXXX (6 alphanumeric chars)
 */
const generateTempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Obs-${rand}`;
};

/**
 * Generate a 6-digit numeric OTP.
 */
const generateOtp = () => {
  const crypto = require('crypto');
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Generate a cryptographically random hex token.
 */
const generateResetToken = () => {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

// In-memory OTP store: email → { otp, expiresAt, attempts }
// In production, use Redis or a DB table. This works for single-instance deploys.
const _otpStore = new Map();

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

const storeOtp = (email, otp) => {
  _otpStore.set(email.toLowerCase(), {
    otp,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
  });
};

const verifyOtp = (email, otp) => {
  const key = email.toLowerCase();
  const entry = _otpStore.get(key);
  if (!entry) return { valid: false, reason: 'No OTP requested for this email.' };
  if (Date.now() > entry.expiresAt) {
    _otpStore.delete(key);
    return { valid: false, reason: 'OTP has expired. Please request a new one.' };
  }
  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    _otpStore.delete(key);
    return { valid: false, reason: 'Too many attempts. Please request a new OTP.' };
  }
  entry.attempts++;
  if (entry.otp !== otp) {
    return { valid: false, reason: 'Invalid OTP.' };
  }
  _otpStore.delete(key);
  return { valid: true };
};

// In-memory reset token store: token → { email, expiresAt }
const _resetTokenStore = new Map();
const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

const storeResetToken = (token, email) => {
  _resetTokenStore.set(token, {
    email: email.toLowerCase(),
    expiresAt: Date.now() + RESET_TOKEN_EXPIRY_MS,
  });
};

const verifyResetToken = (token) => {
  const entry = _resetTokenStore.get(token);
  if (!entry) return { valid: false, reason: 'Invalid or expired reset token.' };
  if (Date.now() > entry.expiresAt) {
    _resetTokenStore.delete(token);
    return { valid: false, reason: 'Reset token has expired.' };
  }
  _resetTokenStore.delete(token);
  return { valid: true, email: entry.email };
};

// In-memory registration OTP store: email → { otp, expiresAt, attempts, resendCount, context }
// context = { type: 'employee'|'customer', userId, tenantId, fullName }
const _registrationOtpStore = new Map();
const REG_OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const REG_OTP_MAX_ATTEMPTS = 5;
const REG_OTP_MAX_RESENDS = 3;

const storeRegistrationOtp = (email, otp, context) => {
  const key = email.toLowerCase();
  const existing = _registrationOtpStore.get(key);
  const resendCount = existing ? (existing.resendCount || 0) + 1 : 0;

  if (resendCount > REG_OTP_MAX_RESENDS) {
    return { stored: false, reason: 'Too many resend requests. Please wait.' };
  }

  _registrationOtpStore.set(key, {
    otp,
    expiresAt: Date.now() + REG_OTP_EXPIRY_MS,
    attempts: 0,
    resendCount,
    context,
  });
  return { stored: true };
};

const verifyRegistrationOtp = (email, otp) => {
  const key = email.toLowerCase();
  const entry = _registrationOtpStore.get(key);
  if (!entry) return { valid: false, reason: 'No verification code found for this email.' };
  if (Date.now() > entry.expiresAt) {
    _registrationOtpStore.delete(key);
    return { valid: false, reason: 'Code expired. Please request a new one.' };
  }
  if (entry.attempts >= REG_OTP_MAX_ATTEMPTS) {
    _registrationOtpStore.delete(key);
    return { valid: false, reason: 'Too many attempts. Please request a new code.' };
  }
  entry.attempts++;
  if (entry.otp !== otp) {
    return { valid: false, reason: 'Invalid code.' };
  }
  const context = entry.context;
  _registrationOtpStore.delete(key);
  return { valid: true, context };
};

// ── Subdomain Validation ─────────────────────────────────
const RESERVED_SUBDOMAINS = [
  'www', 'app', 'api', 'admin', 'mail', 'ftp',
  'static', 'assets', 'cdn', 'dev', 'staging',
];

/**
 * Validate subdomain format.
 * Rules: 3-63 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens.
 */
const isValidSubdomain = (subdomain) => {
  if (!subdomain || typeof subdomain !== 'string') return false;
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(subdomain);
};

const isReservedSubdomain = (subdomain) => {
  return RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase());
};

module.exports = {
  generateReceiptNumber, generateTicketNumber, getPagination, sanitizeSearch, buildSearchFilter,
  isValidUuid, generateTempPassword, generateOtp, generateResetToken,
  storeOtp, verifyOtp, storeResetToken, verifyResetToken,
  storeRegistrationOtp, verifyRegistrationOtp,
  isValidSubdomain, isReservedSubdomain, RESERVED_SUBDOMAINS,
};
