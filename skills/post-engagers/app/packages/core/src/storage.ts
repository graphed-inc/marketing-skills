import { createHash, createHmac } from "node:crypto";
import { coreEnv } from "./config";

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

export async function putObject(key: string, body: Buffer | string, contentType = "application/octet-stream"): Promise<void> {
  const env = coreEnv();
  const endpoint = env.GRAPHED_STORAGE_ENDPOINT;
  const accessKey = env.GRAPHED_STORAGE_ACCESS_KEY_ID;
  const secret = env.GRAPHED_STORAGE_SECRET_ACCESS_KEY;
  const bucket = env.GRAPHED_STORAGE_BUCKET || "project";
  if (!endpoint || !accessKey || !secret) throw new Error("Project storage env (GRAPHED_STORAGE_*) is not set");

  const region = "us-west-2";
  const base = new URL(endpoint);
  const prefix = base.pathname.replace(/\/$/, "");
  const path = `${prefix}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  const payloadHash = sha256(buf);
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);

  const headers: Record<string, string> = { "content-type": contentType, host: base.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const names = Object.keys(headers).sort();
  const canonical = ["PUT", path, "", ...names.map((n) => `${n}:${headers[n]}`), "", names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");

  const res = await fetch(`${base.origin}${path}`, {
    method: "PUT",
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
    },
    body: buf,
  });
  if (!res.ok) throw new Error(`storage PUT ${key}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}
