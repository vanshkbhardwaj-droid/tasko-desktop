import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LaunchRecovery } from "../src/main/recovery";

test("two failed update launches restore the pre-update runtime snapshot", () => {
  const root = mkdtempSync(join(tmpdir(), "tasko-recovery-"));
  const resources = join(root, "resources"); mkdirSync(resources);
  writeFileSync(join(resources, "app.asar"), "version-0.1.0");
  const recovery = new LaunchRecovery(join(root, "data"), resources);
  assert.equal(recovery.snapshotBeforeUpdate("0.1.1"), true);
  writeFileSync(join(resources, "app.asar"), "version-0.1.1");
  assert.equal(recovery.begin("0.1.1").needsRestore, false);
  assert.equal(recovery.begin("0.1.1").needsRestore, false);
  assert.equal(recovery.begin("0.1.1").needsRestore, true);
  assert.equal(recovery.restorePreviousRuntime(), true);
  assert.equal(readFileSync(join(resources, "app.asar"), "utf8"), "version-0.1.0");
  assert.equal(existsSync(join(root, "data", "previous-runtime", "app.asar")), true);
});
