// Graphed project object storage (S3-compatible). Locally (no GRAPHED_STORAGE_* env) files go to ./.data/storage
// and URLs are file paths, so tests run with no cloud.
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream, mkdirSync, copyFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { coreEnv, projectRoot } from "./config";

function bucket() {
  return coreEnv().GRAPHED_STORAGE_BUCKET || "project";
}

function localRoot() {
  return resolve(coreEnv().LOCAL_STORAGE_DIR || join(projectRoot(), ".data", "storage"));
}

export function isCloud() {
  const env = coreEnv();
  return Boolean(env.GRAPHED_STORAGE_ENDPOINT && env.GRAPHED_STORAGE_ACCESS_KEY_ID);
}

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    const env = coreEnv();
    client = new S3Client({
      region: "us-west-2",
      endpoint: env.GRAPHED_STORAGE_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.GRAPHED_STORAGE_ACCESS_KEY_ID || "",
        secretAccessKey: env.GRAPHED_STORAGE_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return client;
}

const TYPES: Record<string, string> = { mp4: "video/mp4", mp3: "audio/mpeg", wav: "audio/wav", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", json: "application/json" };
export const typeOf = (key: string) => TYPES[String(key).split(".").pop()!.toLowerCase()] || "application/octet-stream";

export async function putFile(key: string, path: string, contentType = typeOf(key)) {
  if (!isCloud()) {
    const dst = join(localRoot(), key); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(path, dst); return key;
  }
  // One PutObject up to 64 MiB, like `graphed storage upload`. The gateway's UploadPart response has no ETag
  // header, so @aws-sdk/lib-storage multipart fails ("Part 2 is missing ETag", Nov 2026). A 30 s 1080p final is ~45 MB.
  const size = statSync(path).size;
  if (size <= 64 * 1024 * 1024) {
    await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: createReadStream(path), ContentLength: size, ContentType: contentType }));
    return key;
  }
  await new Upload({ client: s3(), params: { Bucket: bucket(), Key: key, Body: createReadStream(path), ContentType: contentType },
    partSize: 16 * 1024 * 1024, queueSize: 2 }).done();
  return key;
}

export async function putBuffer(key: string, buf: Buffer, contentType = typeOf(key)) {
  if (!isCloud()) {
    const dst = join(localRoot(), key); mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, buf); return key;
  }
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: buf, ContentLength: buf.length, ContentType: contentType }));
  return key;
}

export async function getFile(key: string, path: string) {
  mkdirSync(dirname(path), { recursive: true });
  if (!isCloud()) { copyFileSync(join(localRoot(), key), path); return path; }
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  await pipeline(r.Body as NodeJS.ReadableStream, createWriteStream(path));
  return path;
}

// Presigned GET on api.graphed.com (kie / fal inputs, and every image + video the browser loads). With a
// filename the link downloads instead of playing (Content-Disposition: attachment).
export async function url(key: string, expiresIn = 3600, filename: string | null = null) {
  if (!isCloud()) return "file://" + join(localRoot(), key);
  const cmd: { Bucket: string; Key: string; ResponseContentDisposition?: string } = { Bucket: bucket(), Key: key };
  if (filename) cmd.ResponseContentDisposition = `attachment; filename="${String(filename).replace(/[^\w.-]+/g, "-")}"`;
  return getSignedUrl(s3(), new GetObjectCommand(cmd), { expiresIn });
}

export async function exists(key: string) {
  if (!isCloud()) return existsSync(join(localRoot(), key));
  try { await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key })); return true; } catch { return false; }
}

export async function del(key: string) {
  if (!isCloud()) return;
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch(() => {});
}

// Local-mode stream for the media route.
export function localPath(key: string) {
  const p = join(localRoot(), key);
  return existsSync(p) ? { path: p, size: statSync(p).size } : null;
}

export function readLocal(key: string) {
  if (!key || key.includes("..") || key.startsWith("/")) return null;
  const file = localPath(key);
  if (!file) return null;
  return { ...file, type: typeOf(key) };
}

export async function download(srcUrl: string, path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const r = await fetch(srcUrl, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!r.ok) throw new Error(`download ${r.status} ${srcUrl.slice(0, 80)}`);
  await pipeline(r.body as unknown as NodeJS.ReadableStream, createWriteStream(path));
  return path;
}
