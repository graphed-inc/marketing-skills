// @ts-nocheck
// Live check: one word transcription + one tiny LLM call, from the cloud container.
import { transcribe } from "./render";
import { llm } from "./tools";
import { ffmpeg } from "./media";

await ffmpeg(["-i", "seed/voice-ref.mp3", "-t", "4", "-ac", "1", "-ar", "16000", "/tmp/c.wav"]);
const t0 = Date.now();
const tx = await transcribe("/tmp/c.wav");
console.log("fal", ((Date.now() - t0) / 1000).toFixed(1) + "s", JSON.stringify((tx.chunks || []).slice(0, 3)));
const r = await llm([{ role: "user", content: "Reply with: ok" }], { maxTokens: 5 });
console.log("llm", r.text, r.credits.toFixed(3));
process.exit(0);
