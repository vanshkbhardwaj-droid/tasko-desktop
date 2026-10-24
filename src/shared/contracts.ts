export const MODULES = [
  "home",
  "copilot",
  "inbox",
  "calendar",
  "leads",
  "customers",
  "jobs",
  "money",
  "reports",
  "team",
  "settings"
] as const;

export type ModuleId = (typeof MODULES)[number];
export type EntityKind = "customer" | "lead" | "job" | "task" | "invoice" | "event" | "expense";

export type Density = "comfortable" | "compact" | "focused";

export type RecordItem = {
  id: string;
  title: string;
  subtitle?: string;
  status: string;
  amount?: number;
  currency?: string;
  dueAt?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  data?: Record<string, unknown>;
};

export type DashboardSnapshot = {
  greeting: string;
  date: string;
  offline: boolean;
  overdue: number;
  counts: Record<string, number>;
  attention: Array<{ id: string; label: string; kind: string; dueAt?: string | null }>;
  timeline: Array<{ id: string; title: string; startAt: string; endAt: string; travelMinutes: number; assignee?: string }>;
};

export type AppPreferences = {
  setupComplete: boolean;
  businessName: string;
  locale: "en" | "ar";
  currency: "AED" | "USD" | "EUR" | "GBP" | "SAR";
  density: Density;
  theme: "dark" | "light";
  backupFolder?: string;
  copilot: {
    style: "concise" | "balanced" | "detailed";
    memory: boolean;
    approvals: boolean;
    proactive: boolean;
    quietHours: string;
    modelName: string;
  };
};

export type CalendarEvent = RecordItem & {
  startAt: string;
  endAt: string;
  travelMinutes: number;
  assignee?: string;
  conflict?: boolean;
};

export type InvoiceLine = { description: string; quantity: number; unitPrice: number; taxRate: number };
export type InvoiceDraft = {
  customerId?: string;
  title: string;
  currency: AppPreferences["currency"];
  discount: number;
  dueAt?: string;
  lines: InvoiceLine[];
  kind: "invoice" | "quote" | "credit-note" | "receipt";
};

export type CopilotReply = {
  id: string;
  message: string;
  mode: "offline" | "online";
  requiresApproval?: { action: string; payload: Record<string, unknown> };
  citations: string[];
};

export type TaskoApi = {
  bootstrap(): Promise<{ preferences: AppPreferences; dashboard: DashboardSnapshot; version: string }>;
  preferences: {
    get(): Promise<AppPreferences>;
    save(value: Partial<AppPreferences>): Promise<AppPreferences>;
    completeSetup(value: Pick<AppPreferences, "businessName" | "locale" | "currency" | "backupFolder">): Promise<AppPreferences>;
  };
  records: {
    list(kind: EntityKind, query?: string): Promise<RecordItem[]>;
    create(kind: EntityKind, value: Record<string, unknown>): Promise<RecordItem>;
    update(kind: EntityKind, id: string, value: Record<string, unknown>): Promise<RecordItem>;
    remove(kind: EntityKind, id: string): Promise<void>;
    convertLead(id: string): Promise<RecordItem>;
    search(query: string): Promise<Array<RecordItem & { kind: EntityKind }>>;
  };
  calendar: {
    list(range?: { from: string; to: string }): Promise<CalendarEvent[]>;
    move(id: string, startAt: string, endAt: string): Promise<CalendarEvent>;
    exportIcs(id: string): Promise<string>;
  };
  invoices: {
    create(draft: InvoiceDraft): Promise<RecordItem>;
    createPdf(id: string): Promise<{ path: string; name: string }>;
  };
  copilot: {
    ask(prompt: string): Promise<CopilotReply>;
    history(): Promise<Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }>>;
    forget(): Promise<void>;
  };
  system: {
    backup(): Promise<string>;
    chooseBackupFolder(): Promise<string | null>;
    openPath(path: string): Promise<void>;
    checkForUpdates(): Promise<{ status: string; detail?: string }>;
    signInToSync(): Promise<void>;
    setBadge(count: number): Promise<void>;
  };
};
