import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "release");
const files = readdirSync(root, { recursive: true }) as string[];
const artifacts = files.map((relative) => join(root, relative)).filter((file) => /\.(dmg|exe)$/i.test(file));
if (!artifacts.length) throw new Error("No DMG or EXE artifact found in release/. Build an installer before size verification.");
for (const artifact of artifacts) {
  const bytes = statSync(artifact).size;
  const megabytes = bytes / 1_000_000;
  console.log(`${artifact}: ${megabytes.toFixed(2)} MB`);
  if (megabytes < 300 || megabytes > 600) throw new Error(`Installer size policy failed for ${artifact}. Expected 300–600 MB, received ${megabytes.toFixed(2)} MB.`);
}
