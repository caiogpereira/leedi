import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@leedi/config';

// Byte layout stored in two DB columns:
//   access_token_iv:        base64(tokenIV)       — 12-byte AES-GCM IV for the token
//   access_token_encrypted: "v1.<wrappedDEK_b64>.<dekWrapIV_b64>.<ciphertext_b64>.<authTag_b64>"
//
// Envelope encryption:
//   1. Generate a random 32-byte DEK and 12-byte IV.
//   2. Encrypt the token with AES-256-GCM using the DEK → (ciphertext, authTag, tokenIV).
//   3. Encrypt the DEK with AES-256-GCM using the KEK → (wrappedDEK, _authTag dropped into ciphertext via combined, dekWrapIV).
//   4. Store all blobs. Rotating the KEK only requires re-wrapping DEKs.

const ALGORITHM = 'aes-256-gcm' as const;
const VERSION = 'v1';

function getMasterKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_MASTER_KEY, 'base64');
}

function encryptBlock(
  key: Buffer,
  plaintext: Buffer
): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

function decryptBlock(key: Buffer, ciphertext: Buffer, iv: Buffer, authTag: Buffer): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptToken(plaintext: string): { ciphertext: string; iv: string } {
  const kek = getMasterKey();

  // Generate per-record DEK
  const dek = randomBytes(32);

  // Encrypt the token with DEK
  const {
    ciphertext: tokenCiphertext,
    iv: tokenIV,
    authTag: tokenAuthTag,
  } = encryptBlock(dek, Buffer.from(plaintext, 'utf8'));

  // Wrap the DEK with KEK
  const {
    ciphertext: wrappedDEK,
    iv: dekWrapIV,
    authTag: dekAuthTag,
  } = encryptBlock(kek, dek);

  // Combine wrappedDEK + its authTag into a single blob
  const wrappedDEKWithTag = Buffer.concat([wrappedDEK, dekAuthTag]);

  // Pack ciphertext field: version.wrappedDEK.dekWrapIV.tokenCiphertext.authTag
  const ciphertext = [
    VERSION,
    wrappedDEKWithTag.toString('base64'),
    dekWrapIV.toString('base64'),
    tokenCiphertext.toString('base64'),
    tokenAuthTag.toString('base64'),
  ].join('.');

  return {
    ciphertext,
    iv: tokenIV.toString('base64'),
  };
}

export function decryptToken(ciphertext: string, iv: string): string {
  const kek = getMasterKey();

  const parts = ciphertext.split('.');
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new Error('Invalid ciphertext format');
  }

  const [, wrappedDEKWithTagB64, dekWrapIVB64, tokenCiphertextB64, tokenAuthTagB64] = parts;

  const wrappedDEKWithTag = Buffer.from(wrappedDEKWithTagB64!, 'base64');
  const dekWrapIV = Buffer.from(dekWrapIVB64!, 'base64');
  const tokenCiphertext = Buffer.from(tokenCiphertextB64!, 'base64');
  const tokenAuthTag = Buffer.from(tokenAuthTagB64!, 'base64');
  const tokenIV = Buffer.from(iv, 'base64');

  // Split wrapped DEK: last 16 bytes are the GCM auth tag
  const wrappedDEK = wrappedDEKWithTag.subarray(0, wrappedDEKWithTag.length - 16);
  const dekAuthTag = wrappedDEKWithTag.subarray(wrappedDEKWithTag.length - 16);

  // Unwrap the DEK
  const dek = decryptBlock(kek, wrappedDEK, dekWrapIV, dekAuthTag);

  // Decrypt the token
  const plaintext = decryptBlock(dek, tokenCiphertext, tokenIV, tokenAuthTag);

  return plaintext.toString('utf8');
}
