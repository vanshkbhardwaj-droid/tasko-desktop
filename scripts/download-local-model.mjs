import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";

const destination = join(process.cwd(), "assets", "models", "tasko-qwen2.5-0.5b-q3_k_s.gguf");
const expectedBytes = 338263456;
const expectedSha256 = "468787b643ef9081a75c6e7bd98da987f46583250248e0a0a7aca173308e8d34";
const source = "https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q3_K_S.gguf?download=true";

const checksum = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const valid = () => existsSync(destination) && statSync(destination).size === expectedBytes && checksum(destination) === expectedSha256;

if (valid()) {
  console.log("Bundled local model already verified.");
} else {
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.download`;
  const response = await fetch(source);
  if (!response.ok || !response.body) throw new Error(`Model download failed with ${response.status}.`);
  await pipeline(response.body, createWriteStream(temporary));
  const digest = checksum(temporary);
  if (statSync(temporary).size !== expectedBytes || digest !== expectedSha256) throw new Error("Downloaded model did not match the expected checksum.");
  renameSync(temporary, destination);
  console.log("Bundled local model downloaded and verified.");
}
