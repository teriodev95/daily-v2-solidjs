/**
 * Token crypto utilities for Personal Access Tokens (PATs).
 *
 * Security:
 * - Raw tokens are NEVER logged.
 * - Storage uses SHA-256 hash for lookup and AES-256-GCM for reversible encryption.
 * - A fresh 12-byte IV is generated per encryption via crypto.getRandomValues.
 * - The symmetric key must be provided via env (TOKEN_ENCRYPTION_KEY), never hardcoded.
 */

const TOKEN_PREFIX = 'dk_live_';
const RAW_TOKEN_BODY_LEN = 32;
const TOKEN_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const IV_BYTES = 12; // 96-bit IV for AES-GCM
const KEY_BYTES = 32; // 256-bit key

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
 * Returns base64(IV || ciphertext || authTag). The Web Crypto API appends
 * the 16-byte auth tag to the ciphertext automatically, so the stored
 * payload is [12-byte IV][ciphertext+tag].
 */
export async function encryptToken(raw: string, keyHex: string): Promise<string> {
  const key = await importAesKey(keyHex, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(raw);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );
  const cipher = new Uint8Array(cipherBuf);
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  return bytesToBase64(combined);
}

/**
 * Reverses encryptToken: splits IV + ciphertext+tag, decrypts.
 * Throws if the payload is malformed or the auth tag does not verify.
 */
export async function decryptToken(encrypted: string, keyHex: string): Promise<string> {
  const combined = base64ToBytes(encrypted);
  if (combined.length <= IV_BYTES) {
    throw new Error('Invalid encrypted token payload');
  }
  const iv = combined.slice(0, IV_BYTES);
  const cipher = combined.slice(IV_BYTES);
  const key = await importAesKey(keyHex, ['decrypt']);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipher as BufferSource,
  );
  return new TextDecoder().decode(plainBuf);
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

// ---------- internals ----------

async function importAesKey(keyHex: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const keyBytes = hexToBytes(keyHex);
  if (keyBytes.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be ${KEY_BYTES * 2} hex chars (${KEY_BYTES} bytes); got ${keyBytes.length} bytes`,
    );
  }
  return crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

function bufToHex(buf: Uint8Array): string {
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    out += buf[i].toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const n = parseInt(hex.substring(i, i + 2), 16);
    if (Number.isNaN(n)) throw new Error('Invalid hex string');
    bytes[i / 2] = n;
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
