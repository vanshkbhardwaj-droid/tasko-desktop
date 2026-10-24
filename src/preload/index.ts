import { contextBridge, ipcRenderer } from "electron";
import type { TaskoApi } from "@shared/contracts";

const api: TaskoApi = {
  bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  preferences: { get: () => ipcRenderer.invoke("preferences:get"), save: (value) => ipcRenderer.invoke("preferences:save", value), completeSetup: (value) => ipcRenderer.invoke("preferences:complete-setup", value) },
  records: {
    list: (kind, query) => ipcRenderer.invoke("records:list", kind, query), create: (kind, value) => ipcRenderer.invoke("records:create", kind, value), update: (kind, id, value) => ipcRenderer.invoke("records:update", kind, id, value), remove: (kind, id) => ipcRenderer.invoke("records:remove", kind, id), convertLead: (id) => ipcRenderer.invoke("records:convert-lead", id), search: (query) => ipcRenderer.invoke("records:search", query)
  },
  calendar: { list: (range) => ipcRenderer.invoke("calendar:list", range), move: (id, startAt, endAt) => ipcRenderer.invoke("calendar:move", id, startAt, endAt), exportIcs: (id) => ipcRenderer.invoke("calendar:export-ics", id) },
  invoices: { create: (draft) => ipcRenderer.invoke("invoices:create", draft), createPdf: (id) => ipcRenderer.invoke("invoices:pdf", id) },
  copilot: { ask: (prompt) => ipcRenderer.invoke("copilot:ask", prompt), history: () => ipcRenderer.invoke("copilot:history"), forget: () => ipcRenderer.invoke("copilot:forget") },
  system: { backup: () => ipcRenderer.invoke("system:backup"), chooseBackupFolder: () => ipcRenderer.invoke("system:choose-backup-folder"), openPath: (path) => ipcRenderer.invoke("system:open-path", path), checkForUpdates: () => ipcRenderer.invoke("system:check-updates"), signInToSync: () => ipcRenderer.invoke("system:sign-in"), setBadge: (count) => ipcRenderer.invoke("system:set-badge", count) }
};

contextBridge.exposeInMainWorld("tasko", Object.freeze(api));
