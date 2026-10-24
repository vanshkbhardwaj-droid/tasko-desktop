import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

test("the desktop renderer is local-only and contains no remote window loader", () => {
  const main = readFileSync(join(root, "src/main/index.ts"), "utf8");
  assert.equal(main.includes("loadURL("), false);
  assert.match(main, /loadFile\(/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /setWindowOpenHandler/);
});

test("desktop source has no browser-install artefacts", () => {
  const sourceFiles = walk(join(root, "src"));
  const names = sourceFiles.map((path) => path.toLowerCase());
  assert.equal(names.some((path) => path.endsWith("manifest.json") || path.endsWith("manifest.webmanifest")), false);
  assert.equal(names.some((path) => path.includes("service-worker") || path.endsWith("sw.js")), false);
  const contents = sourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");
  assert.equal(contents.includes("beforeinstall" + "prompt"), false);
  assert.equal(contents.includes("service" + "Worker.register"), false);
});

test("the desktop renderer does not contain retired web-copy", () => {
  const source = walk(join(root, "src/renderer")).map((path) => readFileSync(path, "utf8")).join("\n").toLowerCase();
  const bundleDirectory = join(root, "out", "renderer");
  const bundle = existsSync(bundleDirectory) ? walk(bundleDirectory).filter((path) => /\.(js|html|css)$/i.test(path)).map((path) => readFileSync(path, "utf8")).join("\n").toLowerCase() : "";
  for (const phrase of ["operations hub", "all systems ready", "opening your workspace", "start free", "back to overview", "flowpilot", "create your workspace"]) assert.equal(source.includes(phrase), false, phrase);
  for (const phrase of ["operations hub", "all systems ready", "opening your workspace", "start free", "back to overview", "flowpilot", "create your workspace"]) assert.equal(bundle.includes(phrase), false, `bundle: ${phrase}`);
});

test("the local model and useful offline packs are included", () => {
  const model = join(root, "assets/models/tasko-qwen2.5-0.5b-q3_k_s.gguf");
  assert.equal(existsSync(model), true);
  assert.ok(statSync(model).size > 300_000_000, "the bundled offline model must be materially useful");
  for (const name of ["uae-gazetteer.json", "holiday-reference.json", "currency-reference.json", "tax-presets.json", "phone-formats.json", "timezones.json"]) {
    const path = join(root, "assets/data", name);
    assert.equal(existsSync(path), true, name);
    assert.ok(statSync(path).size > 100, `${name} should contain useful reference data`);
  }
});
