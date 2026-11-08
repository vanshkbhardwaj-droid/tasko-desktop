import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] || join(process.cwd(), "release"));
const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
const checksumFile = "SHA256SUMS.txt";
const statusFile = "TASKO_RELEASE_STATUS.json";
const supportedAssets = /\.(dmg|exe|zip|blockmap|yml)$/i;

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const signatureFor = (platform) => {
  const status = (platform === "macos"
    ? process.env.TASKO_MACOS_SIGNATURE_STATUS
    : process.env.TASKO_WINDOWS_SIGNATURE_STATUS)?.toLowerCase();
  if (status === "signed") {
    return {
      status: "signed",
      message: platform === "macos"
        ? "Developer ID signing was verified in the release workflow."
        : "Authenticode signing was verified in the release workflow.",
    };
  }
  if (status === "unsigned") {
    return {
      status: "unsigned",
      message: platform === "macos"
        ? "Unsigned development build. macOS Gatekeeper may require an explicit approval."
        : "Unsigned development build. Windows SmartScreen may show a warning.",
    };
  }
  return {
    status: "unknown",
    message: "Signing status was not verified by the release workflow.",
  };
};

const platformFor = (name) => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".dmg") || lower.includes("mac")) return "macos";
  if (lower.endsWith(".exe") || lower.includes("win") || lower === "latest.yml") return "windows";
  return null;
};

const architectureFor = (name) => {
  const lower = name.toLowerCase();
  if (lower.includes("arm64") || lower.includes("aarch64")) return "arm64";
  if (lower.includes("x64") || lower.includes("amd64")) return "x64";
  return null;
};

const assertReleaseCompleteness = (records) => {
  const names = new Set(records.map((record) => record.name));
  const windowsInstaller = records.find((record) => record.name.toLowerCase().endsWith(".exe"));
  const macInstaller = records.find((record) => record.name.toLowerCase().endsWith(".dmg"));
  if (!windowsInstaller) throw new Error("Missing a Windows .exe installer in the release assets.");
  if (!macInstaller) throw new Error("Missing a macOS .dmg installer in the release assets.");
  if (!names.has("latest.yml")) throw new Error("Missing latest.yml for the Windows updater.");
  if (!names.has("latest-mac.yml")) throw new Error("Missing latest-mac.yml for the macOS updater.");
  if (!names.has(`${windowsInstaller.name}.blockmap`)) throw new Error(`Missing blockmap for ${windowsInstaller.name}.`);
  if (!names.has(`${macInstaller.name}.blockmap`)) throw new Error(`Missing blockmap for ${macInstaller.name}.`);
};

if (!existsSync(root)) throw new Error(`Release directory does not exist: ${root}`);
if (process.env.TASKO_RELEASE_TAG && process.env.TASKO_RELEASE_TAG !== `v${packageJson.version}`) {
  throw new Error(`Release tag ${process.env.TASKO_RELEASE_TAG} does not match package version ${packageJson.version}.`);
}
const records = walk(root)
  .filter((file) => supportedAssets.test(file))
  .map((file) => {
    const name = relative(root, file).replaceAll("\\", "/");
    const platform = platformFor(basename(file));
    return {
      name,
      size: statSync(file).size,
      sha256: sha256(file),
      platform,
      architecture: architectureFor(basename(file)),
      ...(platform ? { signature: signatureFor(platform) } : {}),
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

assertReleaseCompleteness(records);

writeFileSync(
  join(root, checksumFile),
  `${records.map((record) => `${record.sha256}  ${record.name}`).join("\n")}\n`,
  "utf8",
);
writeFileSync(
  join(root, statusFile),
  `${JSON.stringify({
    schemaVersion: 1,
    version: packageJson.version,
    channel: "development",
    installers: records.filter((record) => record.name.toLowerCase().endsWith(".dmg") || record.name.toLowerCase().endsWith(".exe")),
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${checksumFile} and ${statusFile} for ${records.length} release assets in ${root}.`);
