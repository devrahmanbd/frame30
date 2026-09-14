/**
 * Sealing for outbound webhook signing secrets.
 *
 * A receiver verifies `HMAC(secret, "<ts>.<body>")`, so we must be able to
 * recover the secret to sign with it — a one-way hash is not an option. The
 * value is therefore encrypted at rest with AES-GCM under a server-only master
 * key, so a leaked database row still cannot forge a signature.
 */
export async function masterKey() {
  const material =
    process.env["WEBHOOK_SIGNING_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  if (!material) throw new Error("webhook_signing_key_missing");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64(bytes: Uint8Array) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function unb64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export async function sealSecret(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await masterKey(),
    new TextEncoder().encode(secret),
  );
  return `v1.${b64(iv)}.${b64(new Uint8Array(cipher))}`;
}

/** Returns null rather than throwing: a rotated master key must not crash delivery. */
export async function unsealSecret(sealed: string): Promise<string | null> {
  const [version, iv, cipher] = sealed.split(".");
  if (version !== "v1" || !iv || !cipher) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv) },
      await masterKey(),
      unb64(cipher),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function newWebhookSecret() {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return `whsec_${Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
