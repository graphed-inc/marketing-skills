import assert from "node:assert/strict";
import { agentPrompt } from "./prompt.ts";

const text = agentPrompt("post-engagers");
assert.match(text, /Do not send me into the app/);
assert.match(text, /post to scrape once, or a profile to watch/);
assert.match(text, /profile cap of 25/);
assert.match(text, /node cli\.mjs add "<post url>" --cap 25/);
assert.match(text, /node cli\.mjs track add https:\/\/www\.linkedin\.com\/in\/<user> --backfill 7 --cap 25/);
assert.match(text, /slug is post-engagers/);
assert.equal(agentPrompt("").includes("<project slug>"), true);
console.log("ok");
