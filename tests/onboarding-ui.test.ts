import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("desktop onboarding presents a clear, local-first welcome journey", () => {
  const renderer = readFileSync(join(root, "src/renderer/src/main.tsx"), "utf8");
  const styles = readFileSync(join(root, "src/renderer/styles/mission-control.css"), "utf8");

  assert.match(renderer, /Set up Tasko/);
  assert.match(renderer, /No required account/);
  assert.match(renderer, /Opening your local workspace/);
  assert.equal(renderer.includes("Your work deserves"), false);
  assert.match(styles, /--muted: #b4c0d1/);
  assert.match(styles, /\.welcome-preview/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
