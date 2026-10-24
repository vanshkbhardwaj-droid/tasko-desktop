import type { TaskoApi } from "@shared/contracts";

declare global {
  interface Window { tasko: TaskoApi }
}

export {};
