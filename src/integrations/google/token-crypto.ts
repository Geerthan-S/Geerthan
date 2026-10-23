import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

/** INTEGRATION_ENCRYPTION_KEY: 32 random bytes, base64-encoded (`openssl rand -base64 32`). */
function key(raw = process.env.INTEGRATION_ENCRYPTION_KEY) {
  if (!raw) throw new Error("integration_encryption_key_missing");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error("integration_encryption_key_invalid");
  return bytes;
}

export function encryptionConfigured(raw = process.env.INTEGRATION_ENCRYPTION_KEY) {
  try {
    key(raw);
    return true;
  } catch {
    return false;
  }
}

/** AES-256-GCM; the result is safe to store in a text column. */
export function encryptToken(plaintext: string, raw?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(raw), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptToken(sealed: string, raw?: string) {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("token_format_invalid");
  const decipher = createDecipheriv("aes-256-gcm", key(raw), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString(
    "utf8",
  );
}
