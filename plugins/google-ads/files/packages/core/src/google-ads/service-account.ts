import { z } from "zod";
import { requiredString } from "../config";

/** Service-account JSON accepted by google-auth-library's JWTInput. */
export const serviceAccountKeySchema = z.object({
  type: z.string().optional(),
  client_email: z.string().optional(),
  private_key: requiredString("GOOGLE_ADS_SA_KEY_JSON is missing private_key")
    .min(1, "GOOGLE_ADS_SA_KEY_JSON is missing private_key")
    .refine((value) => value.includes("BEGIN"), {
      message: "GOOGLE_ADS_SA_KEY_JSON private_key must be a PEM key",
    }),
  private_key_id: z.string().optional(),
  project_id: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  refresh_token: z.string().optional(),
  quota_project_id: z.string().optional(),
  universe_domain: z.string().optional(),
});

export type ServiceAccountKey = z.infer<typeof serviceAccountKeySchema>;

export function parseServiceAccountKey(raw: string): ServiceAccountKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_ADS_SA_KEY_JSON must be valid JSON");
  }
  return serviceAccountKeySchema.parse(parsed);
}
