// Graphed project object storage (S3-compatible), SigV4 with node:crypto only.
// Ad images and videos are copied here at pull time, because ad-library CDN links (fbcdn,
// licdn) expire within days. Without GRAPHED_STORAGE_* env (tests, plain `node`) files go to
// ./.data/media instead.
import { createHash, createHmac } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { coreEnv } from "./config";

const REGION = "us-west-2";
const sha256 = (d: Buffer | string) => createHash("sha256").update(d).digest("hex");
const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function creds() {
  const env = coreEnv();
  if (!env.GRAPHED_STORAGE_ENDPOINT || !env.GRAPHED_STORAGE_ACCESS_KEY_ID || !env.GRAPHED_STORAGE_SECRET_ACCESS_KEY) return null;
  const base = new URL(env.GRAPHED_STORAGE_ENDPOINT);
  return {
    base, key: env.GRAPHED_STORAGE_ACCESS_KEY_ID, secret: env.GRAPHED_STORAGE_SECRET_ACCESS_KEY,
    bucket: env.GRAPHED_STORAGE_BUCKET || "project", prefix: base.pathname.replace(/\/$/, ""),
  };
}
type Creds = NonNullable<ReturnType<typeof creds>>;

export const isRemote = () => !!creds();
export const storageMode = () => (isRemote() ? "graphed" : "local");
const localRoot = () => path.resolve(coreEnv().MEDIA_DIR || "./.data/media");
const objectPath = (c: Creds, key: string) => `${c.prefix}/${c.bucket}/${key.split("/").map(enc).join("/")}`;
const signingKey = (c: Creds, day: string) => hmac(hmac(hmac(hmac(`AWS4${c.secret}`, day), REGION), "s3"), "aws4_request");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function localPath(key: string): string | null {
  const root = localRoot();
  const f = path.resolve(root, key);
  return f.startsWith(root + path.sep) ? f : null;
}

export async function put(key: string, body: Buffer, contentType = "application/octet-stream"): Promise<void> {
  const c = creds();
  if (!c) {
    const f = localPath(key);
    if (!f) throw new Error(`bad key ${key}`);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, body);
    return;
  }
  const p = objectPath(c, key);
  const payloadHash = sha256(body);
  const amzDate = stamp();
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { "content-type": contentType, host: c.base.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const names = Object.keys(headers).sort();
  const canonical = ["PUT", p, "", ...names.map((n) => `${n}:${headers[n]}`), "", names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${REGION}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(c, day)).update(toSign).digest("hex");
  const res = await fetch(`${c.base.origin}${p}`, {
    method: "PUT",
    headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${c.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`storage PUT ${key}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

// Presigned GET. The Graphed storage gateway rejects an expiry over 1 hour.
export function presign(key: string, seconds = 3600): string {
  const c = creds();
  if (!c) throw new Error("project storage env is not set");
  const p = objectPath(c, key);
  const amzDate = stamp();
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${REGION}/s3/aws4_request`;
  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${c.key}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(seconds, 3600)),
    "X-Amz-SignedHeaders": "host",
  };
  const query = Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join("&");
  const canonical = ["GET", p, query, `host:${c.base.host}`, "", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(c, day)).update(toSign).digest("hex");
  return `${c.base.origin}${p}?${query}&X-Amz-Signature=${signature}`;
}

export async function get(key: string): Promise<Buffer> {
  if (!isRemote()) {
    const f = localPath(key);
    if (!f) throw new Error(`bad key ${key}`);
    return fs.readFile(f);
  }
  const res = await fetch(presign(key, 900));
  if (!res.ok) throw new Error(`storage GET ${key}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Browser link: a stable app route. GET /m/<key> redirects to a fresh presigned URL, or streams
// the local file. Pages never hold an expired link.
export const urlFor = (key: string) => `/m/${key.split("/").map(encodeURIComponent).join("/")}`;

const MAX_BYTES = 60 * 1024 * 1024; // single PutObject limit is 64 MiB
const EXT: Record<string, string> = { "video/mp4": "mp4", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

// Download a remote file and store it. Returns {key, type, bytes} or null when the link is dead.
export async function copyUrl(url: string | null | undefined, keyBase: string, { timeoutMs = 120_000 }: { timeoutMs?: number } = {}): Promise<{ key: string; type: string; bytes: number } | null> {
  if (!url) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const type = (res.headers.get("content-type") || "").split(";")[0] || "application/octet-stream";
  if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return null;
  const ext = EXT[type] || (type.startsWith("video/") ? "mp4" : type.startsWith("image/") ? "jpg" : "bin");
  const key = `${keyBase}.${ext}`;
  await put(key, buf, type);
  return { key, type, bytes: buf.length };
}
