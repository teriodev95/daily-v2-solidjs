/**
 * Token crypto utilities for Personal Access Tokens (PATs).
 *
 * Security:
 * - Raw tokens are NEVER logged.
 * - Storage uses SHA-256 hash for lookup and AES-256-GCM for reversible encryption.
 * - A fresh 12-byte IV is generated per encryption via crypto.getRandomValues.
 * - The symmetric key must be provided via env (TOKEN_ENCRYPTION_KEY), never hardcoded.
 *
 * The AES-256-GCM primitive lives in lib/aesGcm.ts; encryptToken/decryptToken
 * are thin wrappers so the on-disk format stays shared (and byte-identical)
 * with the secrets vault.
 */

import { encryptString, decryptString, bufToHex } from './aesGcm';

const TOKEN_PREFIX = 'dk_live_';
const RAW_TOKEN_BODY_LEN = 32;
const TOKEN_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a raw PAT: "dk_live_<32 random alphanumeric chars>".
 * Uses crypto.getRandomValues with rejection sampling to avoid modulo bias.
 */
export function generateRawToken(): string {
  const alphabet = TOKEN_ALPHABET;
  const alphabetLen = alphabet.length;
  // Largest multiple of alphabetLen that fits in a byte, to reject bias-introducing values.
  const maxAcceptable = Math.floor(256 / alphabetLen) * alphabetLen;

  const out = new Array<string>(RAW_TOKEN_BODY_LEN);
  let i = 0;
  // Pull bytes in chunks; retry any byte >= maxAcceptable.
  const chunk = new Uint8Array(64);
  while (i < RAW_TOKEN_BODY_LEN) {
    crypto.getRandomValues(chunk);
    for (let j = 0; j < chunk.length && i < RAW_TOKEN_BODY_LEN; j++) {
      const b = chunk[j];
      if (b < maxAcceptable) {
        out[i++] = alphabet[b % alphabetLen];
      }
    }
  }
  return TOKEN_PREFIX + out.join('');
}

/**
 * Returns SHA-256 hex digest of the raw token.
 * Used for O(1) lookup in the database (unique indexed column).
 */
export async function hashToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(new Uint8Array(digest));
}

/**
 * Encrypts the raw token with AES-256-GCM using the key from env.
 * Returns base64(IV || ciphertext+tag). Delegates to the shared aesGcm
 * primitive; the on-disk format is unchanged.
 */
export async function encryptToken(raw: string, keyHex: string): Promise<string> {
  return encryptString(raw, keyHex);
}

/**
 * Reverses encryptToken: splits IV + ciphertext+tag, decrypts.
 * Throws if the payload is malformed or the auth tag does not verify.
 */
export async function decryptToken(encrypted: string, keyHex: string): Promise<string> {
  return decryptString(encrypted, keyHex);
}

/**
 * Returns the first 12 chars of the raw token ("dk_live_" = 8 chars + first 4 of body),
 * safe to display in UI to help users identify which token is which.
 */
export function tokenPrefix(raw: string): string {
  return raw.slice(0, 12);
}

// ---------- Share tokens (HU "URL Share para Agentes") ----------

const SHARE_TOKEN_PREFIX = 'st_';
const SHARE_TOKEN_BODY_LEN = 32;

/**
 * Generates a raw share token: "st_<32 random alphanumeric chars>".
 * Uses crypto.getRandomValues with rejection sampling to avoid modulo bias
 * (same pattern as generateRawToken).
 *
 * Share tokens are throw-away, regeneratable, and NOT encrypted for storage —
 * only the SHA-256 hash is persisted. They grant READ-ONLY access to the
 * resources exposed by a single story's manifest and always expire.
 */
export function generateShareToken(): string {
  const alphabet = TOKEN_ALPHABET;
  const alphabetLen = alphabet.length;
  const maxAcceptable = Math.floor(256 / alphabetLen) * alphabetLen;

  const out = new Array<string>(SHARE_TOKEN_BODY_LEN);
  let i = 0;
  const chunk = new Uint8Array(64);
  while (i < SHARE_TOKEN_BODY_LEN) {
    crypto.getRandomValues(chunk);
    for (let j = 0; j < chunk.length && i < SHARE_TOKEN_BODY_LEN; j++) {
      const b = chunk[j];
      if (b < maxAcceptable) {
        out[i++] = alphabet[b % alphabetLen];
      }
    }
  }
  return SHARE_TOKEN_PREFIX + out.join('');
}

/**
 * Returns the first 11 chars of the raw share token ("st_" + first 8 of body),
 * safe to display in UI for debugging. Never display the full token after the
 * one-time reveal on generation.
 */
export function shareTokenPrefix(raw: string): string {
  return raw.slice(0, 11);
}
