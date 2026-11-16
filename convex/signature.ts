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

export async function sign(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
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
