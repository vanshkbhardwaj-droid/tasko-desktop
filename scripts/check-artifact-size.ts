import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, join, resolve } from "node:path";

/**
 * These bounds catch a broken stub or an accidentally enormous upload without
 * forcing a compressed Electron installer to be padded to an arbitrary size.
 */
export const MIN_INSTALLER_BYTES = 25 * 1024 * 1024;
export const MAX_INSTALLER_BYTES = 2 * 1024 * 1024 * 1024;

export type ReleasePlatform = "macos" | "windows";

const recursiveFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? recursiveFiles(path) : [path];
});

export const assertInstallerSize = (artifact: string, bytes: number) => {
  if (bytes < MIN_INSTALLER_BYTES || bytes > MAX_INSTALLER_BYTES) {
    throw new Error(
      `Installer size safety check failed for ${artifact}. Expected ${MIN_INSTALLER_BYTES}–${MAX_INSTALLER_BYTES} bytes, received ${bytes} bytes.`,
    );
  }
};

const expectedMetadata = (platform: ReleasePlatform) => platform === "macos"
  ? ["latest-mac.yml", ".dmg.blockmap"]
  : ["latest.yml", ".exe.blockmap"];

export const checkInstallerArtifacts = (root: string, platform?: ReleasePlatform) => {
  if (!existsSync(root)) throw new Error(`Release directory does not exist: ${root}`);
  const files = recursiveFiles(root);
  const installers = files.filter((file) => /\.(dmg|exe)$/i.test(file));
  if (!installers.length) throw new Error("No DMG or EXE artifact found in release/. Build an installer before size verification.");

  const filteredInstallers = platform === "macos"
    ? installers.filter((file) => /\.dmg$/i.test(file))
    : platform === "windows"
      ? installers.filter((file) => /\.exe$/i.test(file))
      : installers;
  if (platform && !filteredInstallers.length) throw new Error(`No ${platform} installer was found in ${root}.`);

  for (const artifact of filteredInstallers) {
    const bytes = statSync(artifact).size;
    const megabytes = bytes / 1_000_000;
    console.log(`${artifact}: ${megabytes.toFixed(2)} MB`);
    assertInstallerSize(artifact, bytes);
  }

  if (platform) {
    const names = new Set(files.map((file) => basename(file)));
    for (const required of expectedMetadata(platform)) {
      const found = required.startsWith(".")
        ? [...names].some((name) => name.toLowerCase().endsWith(required))
        : names.has(required);
      if (!found) throw new Error(`Missing ${platform} update metadata (${required}) in ${root}.`);
    }
  }
};

const argument = process.argv.find((value) => value.startsWith("--platform="));
const platform = argument?.replace("--platform=", "") as ReleasePlatform | undefined;
if (platform && platform !== "macos" && platform !== "windows") throw new Error(`Unsupported platform: ${platform}`);
const runningAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runningAsScript) checkInstallerArtifacts(join(process.cwd(), "release"), platform);
