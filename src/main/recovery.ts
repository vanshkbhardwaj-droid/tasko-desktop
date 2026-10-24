import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type RecoveryState = {
  launching: boolean;
  failures: number;
  pendingVersion?: string;
  lastGoodVersion?: string;
  snapshotReady?: boolean;
};

const initial: RecoveryState = { launching: false, failures: 0 };

export class LaunchRecovery {
  private readonly statePath: string;
  private readonly snapshotDirectory: string;
  constructor(private readonly userDataPath: string, private readonly resourcesPath: string) {
    this.statePath = join(userDataPath, "launch-recovery.json");
    this.snapshotDirectory = join(userDataPath, "previous-runtime");
  }

  private read(): RecoveryState {
    try { return { ...initial, ...JSON.parse(readFileSync(this.statePath, "utf8")) } as RecoveryState; }
    catch { return { ...initial }; }
  }
  private write(state: RecoveryState) { mkdirSync(dirname(this.statePath), { recursive: true }); writeFileSync(this.statePath, JSON.stringify(state)); }

  begin(version: string) {
    const state = this.read();
    const failures = state.launching && state.pendingVersion ? state.failures + 1 : state.failures;
    const needsRestore = Boolean(state.pendingVersion && state.snapshotReady && failures >= 2);
    this.write({ ...state, launching: true, failures, lastGoodVersion: state.lastGoodVersion ?? version });
    return { needsRestore, failures, pendingVersion: state.pendingVersion };
  }

  markHealthy(version: string) {
    const state = this.read();
    this.write({ ...state, launching: false, failures: 0, pendingVersion: undefined, lastGoodVersion: version, snapshotReady: false });
  }

  snapshotBeforeUpdate(nextVersion: string) {
    const sourceAsar = join(this.resourcesPath, "app.asar");
    if (!existsSync(sourceAsar)) return false;
    mkdirSync(this.snapshotDirectory, { recursive: true });
    copyFileSync(sourceAsar, join(this.snapshotDirectory, "app.asar"));
    const sourceUnpacked = join(this.resourcesPath, "app.asar.unpacked");
    if (existsSync(sourceUnpacked)) cpSync(sourceUnpacked, join(this.snapshotDirectory, "app.asar.unpacked"), { recursive: true, force: true });
    const state = this.read();
    this.write({ ...state, pendingVersion: nextVersion, snapshotReady: true, failures: 0 });
    return true;
  }

  restorePreviousRuntime() {
    const previousAsar = join(this.snapshotDirectory, "app.asar");
    if (!existsSync(previousAsar)) return false;
    copyFileSync(previousAsar, join(this.resourcesPath, "app.asar"));
    const previousUnpacked = join(this.snapshotDirectory, "app.asar.unpacked");
    if (existsSync(previousUnpacked)) cpSync(previousUnpacked, join(this.resourcesPath, "app.asar.unpacked"), { recursive: true, force: true });
    const state = this.read();
    this.write({ ...state, launching: false, failures: 0, pendingVersion: undefined, snapshotReady: false });
    return true;
  }
}
