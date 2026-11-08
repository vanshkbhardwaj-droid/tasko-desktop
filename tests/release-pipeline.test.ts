import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { assertInstallerSize, MAX_INSTALLER_BYTES, MIN_INSTALLER_BYTES } from "../scripts/check-artifact-size";

const root = process.cwd();

test("installer size guard permits real artifacts without artificial padding", () => {
  assert.doesNotThrow(() => assertInstallerSize("Tasko-win-x64.exe", MIN_INSTALLER_BYTES));
  assert.doesNotThrow(() => assertInstallerSize("Tasko-win-x64.exe", MAX_INSTALLER_BYTES));
  assert.throws(() => assertInstallerSize("stub.exe", MIN_INSTALLER_BYTES - 1), /safety check failed/);
  assert.throws(() => assertInstallerSize("oversized.exe", MAX_INSTALLER_BYTES + 1), /safety check failed/);
});

test("release manifest records checksums and per-platform signature status for the exact assets", () => {
  const fixture = mkdtempSync(join(tmpdir(), "tasko-release-manifest-"));
  try {
    for (const [name, content] of [
      ["Tasko-0.1.8-win-x64.exe", "windows installer"],
      ["Tasko-0.1.8-win-x64.exe.blockmap", "windows blockmap"],
      ["latest.yml", "version: 0.1.8"],
      ["Tasko-0.1.8-mac-x64.dmg", "mac installer"],
      ["Tasko-0.1.8-mac-x64.dmg.blockmap", "mac blockmap"],
      ["latest-mac.yml", "version: 0.1.8"],
    ] as const) writeFileSync(join(fixture, name), content, "utf8");

    execFileSync(process.execPath, [join(root, "scripts/create-release-manifest.mjs"), fixture], {
      cwd: root,
      env: { ...process.env, TASKO_MACOS_SIGNATURE_STATUS: "signed", TASKO_WINDOWS_SIGNATURE_STATUS: "unsigned" },
      stdio: "pipe",
    });

    const checksums = readFileSync(join(fixture, "SHA256SUMS.txt"), "utf8").trim().split("\n");
    assert.equal(checksums.length, 6);
    assert.deepEqual(
      checksums.map((line) => line.split("  ")[1]),
      [
        "latest-mac.yml",
        "latest.yml",
        "Tasko-0.1.8-mac-x64.dmg",
        "Tasko-0.1.8-mac-x64.dmg.blockmap",
        "Tasko-0.1.8-win-x64.exe",
        "Tasko-0.1.8-win-x64.exe.blockmap",
      ].sort((left, right) => left.localeCompare(right)),
    );
    const status = JSON.parse(readFileSync(join(fixture, "TASKO_RELEASE_STATUS.json"), "utf8")) as {
      version: string;
      installers: Array<{ name: string; signature: { status: string } }>;
    };
    assert.equal(status.version, "0.1.8");
    assert.deepEqual(
      status.installers.map(({ name, signature }) => ({ name, signature })),
      [
        { name: "Tasko-0.1.8-mac-x64.dmg", signature: { status: "signed", message: "Developer ID signing was verified in the release workflow." } },
        { name: "Tasko-0.1.8-win-x64.exe", signature: { status: "unsigned", message: "Unsigned development build. Windows SmartScreen may show a warning." } },
      ],
    );
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
});

test("release workflow creates a real x64 Windows prerelease after installer verification", () => {
  const packageConfig = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    build: { win: { target: Array<{ target: string; arch: string[] }> } };
  };
  const workflow = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
  const smokeTest = readFileSync(join(root, "scripts/test-windows-installer.ps1"), "utf8");

  assert.equal(packageConfig.scripts["make:windows"].includes("--arm64"), false);
  assert.deepEqual(packageConfig.build.win.target, [{ target: "nsis", arch: ["x64"] }]);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /softprops\/action-gh-release@v2/);
  assert.match(workflow, /release-assets\/\*/);
  assert.match(workflow, /codesign --verify --deep --strict --verbose=2 "release\/mac\/Tasko\.app"/);
  assert.match(workflow, /Authority=Developer ID Application:/);
  assert.match(workflow, /TASKO_RELEASE_REVALIDATE_SECRET/);
  assert.match(workflow, /x-tasko-release-revalidate/);
  assert.match(smokeTest, /ArgumentList @\("\/S", "\/D=\$installRoot"\)/);
  assert.match(smokeTest, /Start Menu shortcut/);
  assert.match(smokeTest, /New-NetFirewallRule -Name \$firewallRuleName/);
  assert.match(smokeTest, /-Direction Outbound -Program \$taskoExe -Action Block/);
  assert.match(smokeTest, /Remove-NetFirewallRule -Name \$firewallRuleName/);
  assert.match(smokeTest, /offline standalone launch/);
  assert.match(smokeTest, /Tasko\.exe remains after silent uninstall/);
});
