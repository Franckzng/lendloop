// Request signing shared by every call between Convex and n8n.
// signature = HMAC-SHA256(secret, timestamp + "." + body), as lowercase hex.
// The timestamp is part of the signed text, so a captured request cannot be
// replayed later with a fresh timestamp.

export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_HEADER = "X-LendLoop-Signature";

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function importKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function sign(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await importKey(secret, "sign");
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`),
  );
  return toHex(signature);
}

/** The two headers that authenticate a request body sent right now. */
export async function signedHeaders(
  secret: string,
  body: string,
): Promise<Record<string, string>> {
  const timestamp = String(Date.now());
  return {
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: await sign(secret, timestamp, body),
  };
}

/** Requests older (or newer) than this are rejected, to limit replays. */
const MAX_AGE_MS = 5 * 60 * 1000;

const SIGNATURE_FORMAT = /^[0-9a-f]{64}$/;
const TIMESTAMP_FORMAT = /^\d{1,15}$/;

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * True when the signature matches the body and the timestamp is recent.
 * The comparison is done by crypto.subtle.verify, which runs in constant
 * time: how long it takes reveals nothing about how close a guess was.
 */
export async function verify(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): Promise<boolean> {
  if (!TIMESTAMP_FORMAT.test(timestamp) || !SIGNATURE_FORMAT.test(signature)) {
    return false;
  }
  if (Math.abs(Date.now() - Number(timestamp)) > MAX_AGE_MS) {
    return false;
  }
  const key = await importKey(secret, "verify");
  return await crypto.subtle.verify(
    "HMAC",
    key,
    fromHex(signature),
    encoder.encode(`${timestamp}.${body}`),
  );
}
