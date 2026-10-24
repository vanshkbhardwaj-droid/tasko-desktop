import { app, BrowserWindow, Menu, Notification, Tray, globalShortcut, ipcMain, nativeImage, shell, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { join } from "node:path";
import { z } from "zod";
import { LocalDatabase } from "./database";
import { createInvoicePdf } from "./pdf";
import { LocalCopilot } from "./copilot";
import type { EntityKind, InvoiceDraft } from "@shared/contracts";

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let database: LocalDatabase;
let copilot: LocalCopilot;
const entitySchema = z.enum(["customer", "lead", "job", "task", "invoice", "event", "expense"]);
const recordSchema = z.record(z.string(), z.unknown()).refine((item) => typeof item.title === "string" || item.title === undefined, "Title must be text");
const invoiceSchema = z.object({ customerId: z.string().optional(), title: z.string().min(1).max(180), currency: z.enum(["AED", "USD", "EUR", "GBP", "SAR"]), discount: z.number().min(0), dueAt: z.string().optional(), kind: z.enum(["invoice", "quote", "credit-note", "receipt"]), lines: z.array(z.object({ description: z.string().min(1), quantity: z.number().positive(), unitPrice: z.number().min(0), taxRate: z.number().min(0).max(100) })).min(1) });

function rendererEntry() { return join(__dirname, "../renderer/index.html"); }
function send(channel: string, value: unknown) { mainWindow?.webContents.send(channel, value); }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1080, minHeight: 680,
    title: "Tasko",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    backgroundColor: "#0B0F17",
    vibrancy: process.platform === "darwin" ? "sidebar" : undefined,
    webPreferences: { preload: join(__dirname, "../preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  void mainWindow.loadFile(rendererEntry());
  mainWindow.on("close", () => { mainWindow = undefined; });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Tasko");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Tasko", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: "Quick capture", accelerator: "CommandOrControl+Shift+Space", click: () => send("tasko:quick-capture", true) },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ]));
  tray.on("click", () => mainWindow?.show());
}

function configureMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Tasko", submenu: [{ label: "About Tasko", role: "about" }, { type: "separator" }, { label: "Check for updates", click: () => void checkForUpdates() }, { type: "separator" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }] }
  ]));
}

async function checkForUpdates() {
  if (!app.isPackaged) return { status: "Development build", detail: "Updates are checked from signed releases after packaging." };
  try { const result = await autoUpdater.checkForUpdates(); return { status: result?.updateInfo.version ? "Update available" : "Up to date", detail: result?.updateInfo.version }; }
  catch { return { status: "Unavailable", detail: "Updates could not be checked right now." }; }
}

function registerIpc() {
  ipcMain.handle("app:bootstrap", () => ({ preferences: database.getPreferences(), dashboard: database.dashboard(), version: app.getVersion() }));
  ipcMain.handle("preferences:get", () => database.getPreferences());
  ipcMain.handle("preferences:save", (_event, input) => database.savePreferences(z.record(z.string(), z.unknown()).parse(input)));
  ipcMain.handle("preferences:complete-setup", (_event, input) => database.savePreferences({ ...z.object({ businessName: z.string().max(120), locale: z.enum(["en", "ar"]), currency: z.enum(["AED", "USD", "EUR", "GBP", "SAR"]), backupFolder: z.string().optional() }).parse(input), setupComplete: true }));
  ipcMain.handle("records:list", (_event, kind, query) => database.list(entitySchema.parse(kind) as EntityKind, z.string().max(160).optional().parse(query) ?? ""));
  ipcMain.handle("records:create", (_event, kind, value) => database.create(entitySchema.parse(kind) as EntityKind, recordSchema.parse(value)));
  ipcMain.handle("records:update", (_event, kind, id, value) => database.update(entitySchema.parse(kind) as EntityKind, z.string().uuid().parse(id), recordSchema.parse(value)));
  ipcMain.handle("records:remove", (_event, kind, id) => database.remove(entitySchema.parse(kind) as EntityKind, z.string().uuid().parse(id)));
  ipcMain.handle("records:convert-lead", (_event, id) => database.convertLead(z.string().uuid().parse(id)));
  ipcMain.handle("records:search", (_event, query) => database.search(z.string().max(160).parse(query)));
  ipcMain.handle("calendar:list", (_event, range) => { const parsed = z.object({ from: z.string(), to: z.string() }).optional().parse(range); return database.listEvents(parsed?.from, parsed?.to); });
  ipcMain.handle("calendar:move", (_event, id, startAt, endAt) => database.moveEvent(z.string().uuid().parse(id), z.string().datetime().parse(startAt), z.string().datetime().parse(endAt)));
  ipcMain.handle("calendar:export-ics", (_event, id) => { const event = database.listEvents().find((item) => item.id === z.string().uuid().parse(id)); if (!event) throw new Error("Appointment not found."); return `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:${event.id}\nDTSTART:${event.startAt.replace(/[-:]/g, "").replace(/\.\d+Z/, "Z")}\nDTEND:${event.endAt.replace(/[-:]/g, "").replace(/\.\d+Z/, "Z")}\nSUMMARY:${event.title}\nEND:VEVENT\nEND:VCALENDAR`; });
  ipcMain.handle("invoices:create", (_event, draft) => database.createInvoice(invoiceSchema.parse(draft) as InvoiceDraft));
  ipcMain.handle("invoices:pdf", async (_event, id) => createInvoicePdf(database, z.string().uuid().parse(id), join(app.getPath("documents"), "Tasko"), app.isPackaged ? join(process.resourcesPath, "assets") : join(app.getAppPath(), "assets")));
  ipcMain.handle("copilot:ask", (_event, prompt) => copilot.ask(z.string().min(1).max(4000).parse(prompt)));
  ipcMain.handle("copilot:history", () => copilot.history());
  ipcMain.handle("copilot:forget", () => copilot.forget());
  ipcMain.handle("system:backup", () => database.backup());
  ipcMain.handle("system:choose-backup-folder", async () => { const picked = await dialog.showOpenDialog(mainWindow!, { properties: ["openDirectory", "createDirectory"] }); return picked.canceled ? null : picked.filePaths[0] ?? null; });
  ipcMain.handle("system:open-path", (_event, value) => shell.openPath(z.string().min(1).parse(value)).then(() => undefined));
  ipcMain.handle("system:check-updates", () => checkForUpdates());
  ipcMain.handle("system:sign-in", async () => { await shell.openExternal("https://tasko-tasko-ai.vercel.app/sign-in?source=desktop"); });
  ipcMain.handle("system:set-badge", (_event, count) => { const valid = z.number().int().min(0).max(999).parse(count); app.setBadgeCount(valid); if (Notification.isSupported() && valid > 0) new Notification({ title: "Tasko", body: `${valid} item${valid === 1 ? " needs" : "s need"} attention.` }).show(); });
}

app.enableSandbox();
app.setAppUserModelId("com.vansh.tasko");
app.whenReady().then(() => {
  database = new LocalDatabase(join(app.getPath("userData"), "tasko.sqlite"));
  copilot = new LocalCopilot(database, process.resourcesPath);
  registerIpc(); configureMenu(); createWindow(); createTray();
  globalShortcut.register("CommandOrControl+Shift+Space", () => { mainWindow?.show(); mainWindow?.focus(); send("tasko:quick-capture", true); });
  autoUpdater.autoDownload = true;
  autoUpdater.on("update-downloaded", (info) => send("tasko:update-ready", { version: info.version, notes: info.releaseNotes }));
  void checkForUpdates();
  setInterval(() => void checkForUpdates(), 4 * 60 * 60 * 1000);
  app.on("activate", () => { if (!mainWindow) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("open-url", (event, url) => { event.preventDefault(); if (url.startsWith("tasko://")) { mainWindow?.show(); send("tasko:deep-link", url); } });
