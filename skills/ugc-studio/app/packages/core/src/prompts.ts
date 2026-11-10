// @ts-nocheck
// prompts/*.md|txt with {{name}} slots.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP } from "./media";

export function prompt(name, vars = {}) {
  let t = readFileSync(join(APP, "prompts", name), "utf8");
  for (const [k, v] of Object.entries(vars)) t = t.split(`{{${k}}}`).join(String(v ?? ""));
  return t;
}
