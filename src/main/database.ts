import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { AppPreferences, CalendarEvent, DashboardSnapshot, EntityKind, InvoiceDraft, RecordItem } from "@shared/contracts";

type Db = InstanceType<typeof Database>;

const isoNow = () => new Date().toISOString();
const defaultPreferences: AppPreferences = {
  setupComplete: false,
  businessName: "",
  locale: "en",
  currency: "AED",
  density: "comfortable",
  theme: "dark",
  copilot: { style: "balanced", memory: true, approvals: true, proactive: true, quietHours: "22:00–07:00", modelName: "Tasko Local" }
};

const tables: Record<EntityKind, string> = {
  customer: "customers",
  lead: "leads",
  job: "jobs",
  task: "tasks",
  invoice: "invoices",
  event: "calendar_events",
  expense: "expenses"
};

const migrations = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, status TEXT NOT NULL DEFAULT 'active', amount REAL, currency TEXT, due_at TEXT, tags TEXT NOT NULL DEFAULT '[]', data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, status TEXT NOT NULL DEFAULT 'new', amount REAL, currency TEXT, due_at TEXT, tags TEXT NOT NULL DEFAULT '[]', data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, status TEXT NOT NULL DEFAULT 'planned', amount REAL, currency TEXT, due_at TEXT, tags TEXT NOT NULL DEFAULT '[]', data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, status TEXT NOT NULL DEFAULT 'todo', amount REAL, currency TEXT, due_at TEXT, tags TEXT NOT NULL DEFAULT '[]', data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, status TEXT NOT NULL DEFAULT 'draft', amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'AED', due_at TEXT, tags TEXT NOT NULL DEFAULT '[]', data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS invoice_lines (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, description TEXT NOT NULL, quantity REAL NOT NULL, unit_price REAL NOT NULL, tax_rate REAL NOT NULL);
   CREATE TABLE IF NOT EXISTS calendar_events (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, status TEXT NOT NULL DEFAULT 'confirmed', amount REAL, currency TEXT, due_at TEXT, tags TEXT NOT NULL DEFAULT '[]', data TEXT NOT NULL DEFAULT '{}', start_at TEXT NOT NULL, end_at TEXT NOT NULL, travel_minutes INTEGER NOT NULL DEFAULT 0, assignee TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, status TEXT NOT NULL DEFAULT 'recorded', amount REAL, currency TEXT, due_at TEXT, tags TEXT NOT NULL DEFAULT '[]', data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS copilot_messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, action TEXT NOT NULL, entity_kind TEXT, entity_id TEXT, detail TEXT NOT NULL, created_at TEXT NOT NULL);`,
  `CREATE INDEX IF NOT EXISTS idx_customers_title ON customers(title);
   CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
   CREATE INDEX IF NOT EXISTS idx_events_range ON calendar_events(start_at, end_at);
   CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);`
];

function decode(row: Record<string, unknown>): RecordItem {
  return {
    id: String(row.id), title: String(row.title), subtitle: row.subtitle ? String(row.subtitle) : undefined,
    status: String(row.status), amount: typeof row.amount === "number" ? row.amount : undefined,
    currency: row.currency ? String(row.currency) : undefined, dueAt: row.due_at ? String(row.due_at) : null,
    tags: JSON.parse(String(row.tags ?? "[]")), data: JSON.parse(String(row.data ?? "{}")),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at)
  };
}

export class LocalDatabase {
  readonly db: Db;
  constructor(readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    const shouldBackup = existsSync(filePath);
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
    const schema = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value?: string } | undefined;
    const version = Number(schema?.value ?? 0);
    if (shouldBackup && version < migrations.length) this.backup(`pre-migration-${version}`);
    this.db.transaction(() => {
      for (let i = version; i < migrations.length; i += 1) this.db.exec(migrations[i]);
      this.db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('schema_version', ?)").run(String(migrations.length));
    })();
    this.seed();
  }

  private audit(action: string, kind?: EntityKind, id?: string, detail: Record<string, unknown> = {}) {
    this.db.prepare("INSERT INTO audit_log(id, action, entity_kind, entity_id, detail, created_at) VALUES(?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), action, kind ?? null, id ?? null, JSON.stringify(detail), isoNow());
  }

  private seed() {
    const customerCount = this.db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number };
    if (Number(customerCount.count) > 0) return;
    const now = isoNow();
    const add = (kind: EntityKind, title: string, fields: Record<string, unknown>) => this.create(kind, { title, ...fields }, false);
    add("customer", "Noura Al Mansoori", { subtitle: "Al Noor Interiors · Dubai", tags: ["priority", "interiors"] });
    add("customer", "Harbour House", { subtitle: "Hospitality · Jumeirah", tags: ["retainer"] });
    add("lead", "Palm Grove Villa", { subtitle: "Referral · Jumeirah", status: "qualified", amount: 28500, currency: "AED", dueAt: now, tags: ["follow-up"] });
    add("lead", "Mina Atelier", { subtitle: "Website enquiry · Dubai Design District", status: "proposal", amount: 14200, currency: "AED" });
    add("task", "Confirm finish selections", { subtitle: "Palm Grove Villa", dueAt: now, status: "today", tags: ["design"] });
    add("job", "Harbour House refresh", { subtitle: "Site team", status: "in-progress", amount: 42000, currency: "AED" });
    const start = new Date(); start.setHours(11, 0, 0, 0); const end = new Date(start); end.setHours(12, 0, 0, 0);
    this.create("event", { title: "Palm Grove site visit", subtitle: "Jumeirah · 30 min travel", startAt: start.toISOString(), endAt: end.toISOString(), travelMinutes: 30, assignee: "You" }, false);
  }

  getPreferences(): AppPreferences {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'preferences'").get() as { value?: string } | undefined;
    return row?.value ? { ...defaultPreferences, ...JSON.parse(row.value), copilot: { ...defaultPreferences.copilot, ...JSON.parse(row.value).copilot } } : defaultPreferences;
  }

  savePreferences(update: Partial<AppPreferences>) {
    const value = { ...this.getPreferences(), ...update, copilot: { ...this.getPreferences().copilot, ...update.copilot } };
    this.db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('preferences', ?)").run(JSON.stringify(value));
    this.audit("preferences.updated", undefined, undefined, { keys: Object.keys(update) });
    return value;
  }

  list(kind: EntityKind, query = ""): RecordItem[] {
    const table = tables[kind];
    const hasQuery = query.trim().length > 0;
    const rows = hasQuery
      ? this.db.prepare(`SELECT * FROM ${table} WHERE title LIKE ? OR COALESCE(subtitle, '') LIKE ? ORDER BY updated_at DESC LIMIT 100000`).all(`%${query.trim()}%`, `%${query.trim()}%`)
      : this.db.prepare(`SELECT * FROM ${table} ORDER BY updated_at DESC LIMIT 100000`).all();
    return (rows as Record<string, unknown>[]).map(decode);
  }

  create(kind: EntityKind, value: Record<string, unknown>, audit = true): RecordItem {
    const id = randomUUID(), now = isoNow(), table = tables[kind];
    const title = String(value.title ?? "Untitled").trim() || "Untitled";
    const base = [id, title, value.subtitle ? String(value.subtitle) : null, String(value.status ?? (kind === "lead" ? "new" : "active")), typeof value.amount === "number" ? value.amount : null, value.currency ? String(value.currency) : null, value.dueAt ? String(value.dueAt) : null, JSON.stringify(Array.isArray(value.tags) ? value.tags : []), JSON.stringify(value.data ?? {}), now, now];
    if (kind === "event") {
      const startAt = String(value.startAt ?? now), endAt = String(value.endAt ?? new Date(Date.now() + 3_600_000).toISOString());
      this.assertEventFree(startAt, endAt, value.assignee ? String(value.assignee) : undefined);
      this.db.prepare(`INSERT INTO ${table}(id,title,subtitle,status,amount,currency,due_at,tags,data,start_at,end_at,travel_minutes,assignee,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(...base.slice(0, 9), startAt, endAt, Number(value.travelMinutes ?? 0), value.assignee ? String(value.assignee) : null, now, now);
    } else {
      this.db.prepare(`INSERT INTO ${table}(id,title,subtitle,status,amount,currency,due_at,tags,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(...base);
    }
    if (audit) this.audit("record.created", kind, id, { title });
    return this.get(kind, id);
  }

  get(kind: EntityKind, id: string): RecordItem {
    const row = this.db.prepare(`SELECT * FROM ${tables[kind]} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error("The selected record no longer exists.");
    return decode(row);
  }

  update(kind: EntityKind, id: string, patch: Record<string, unknown>): RecordItem {
    const existing = this.get(kind, id);
    const now = isoNow();
    const next = { ...existing, ...patch };
    const table = tables[kind];
    const values = [next.title, next.subtitle ?? null, next.status, next.amount ?? null, next.currency ?? null, next.dueAt ?? null, JSON.stringify(next.tags ?? []), JSON.stringify(next.data ?? {}), now];
    if (kind === "event") {
      const event = this.db.prepare("SELECT start_at, end_at, travel_minutes, assignee FROM calendar_events WHERE id = ?").get(id) as { start_at: string; end_at: string; travel_minutes: number; assignee: string | null };
      if (patch.startAt || patch.endAt || patch.assignee) this.assertEventFree(String(patch.startAt ?? event.start_at), String(patch.endAt ?? event.end_at), patch.assignee ? String(patch.assignee) : event.assignee ?? undefined, id);
      this.db.prepare(`UPDATE ${table} SET title=?,subtitle=?,status=?,amount=?,currency=?,due_at=?,tags=?,data=?,updated_at=?,start_at=?,end_at=?,travel_minutes=?,assignee=? WHERE id=?`)
        .run(...values, String(patch.startAt ?? event.start_at), String(patch.endAt ?? event.end_at), Number(patch.travelMinutes ?? event.travel_minutes), patch.assignee ? String(patch.assignee) : event.assignee, id);
    } else this.db.prepare(`UPDATE ${table} SET title=?,subtitle=?,status=?,amount=?,currency=?,due_at=?,tags=?,data=?,updated_at=? WHERE id=?`).run(...values, id);
    this.audit("record.updated", kind, id, { keys: Object.keys(patch) });
    return this.get(kind, id);
  }

  remove(kind: EntityKind, id: string) { this.db.prepare(`DELETE FROM ${tables[kind]} WHERE id = ?`).run(id); this.audit("record.removed", kind, id); }

  convertLead(id: string) {
    const lead = this.get("lead", id);
    const customer = this.create("customer", { title: lead.title, subtitle: lead.subtitle, tags: lead.tags, data: { convertedFrom: id } });
    this.db.prepare("UPDATE leads SET status='converted', updated_at=? WHERE id=?").run(isoNow(), id);
    this.audit("lead.converted", "lead", id, { customerId: customer.id });
    return customer;
  }

  listEvents(from?: string, to?: string): CalendarEvent[] {
    const query = from && to ? "SELECT * FROM calendar_events WHERE start_at < ? AND end_at > ? ORDER BY start_at" : "SELECT * FROM calendar_events ORDER BY start_at";
    const rows = (from && to ? this.db.prepare(query).all(to, from) : this.db.prepare(query).all()) as Record<string, unknown>[];
    return rows.map((row) => ({ ...decode(row), startAt: String(row.start_at), endAt: String(row.end_at), travelMinutes: Number(row.travel_minutes), assignee: row.assignee ? String(row.assignee) : undefined }));
  }

  moveEvent(id: string, startAt: string, endAt: string) {
    const event = this.listEvents().find((item) => item.id === id);
    if (!event) throw new Error("The appointment was not found.");
    this.assertEventFree(startAt, endAt, event.assignee, id);
    this.db.prepare("UPDATE calendar_events SET start_at=?, end_at=?, updated_at=? WHERE id=?").run(startAt, endAt, isoNow(), id);
    return this.listEvents().find((item) => item.id === id)!;
  }

  private assertEventFree(startAt: string, endAt: string, assignee?: string, exceptId?: string) {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM calendar_events WHERE id != ? AND (? IS NULL OR assignee = ?) AND start_at < ? AND end_at > ?")
      .get(exceptId ?? "", assignee ?? null, assignee ?? null, endAt, startAt) as { count: number };
    if (count.count > 0) throw new Error("That time overlaps an existing appointment for this team member.");
  }

  createInvoice(draft: InvoiceDraft) {
    const subtotal = draft.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const tax = draft.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice * (line.taxRate / 100), 0);
    const total = Math.max(0, subtotal + tax - draft.discount);
    const invoice = this.create("invoice", { title: draft.title, status: "draft", amount: total, currency: draft.currency, dueAt: draft.dueAt, data: { ...draft, subtotal, tax, total } });
    const insert = this.db.prepare("INSERT INTO invoice_lines(id,invoice_id,description,quantity,unit_price,tax_rate) VALUES(?,?,?,?,?,?)");
    for (const line of draft.lines) insert.run(randomUUID(), invoice.id, line.description, line.quantity, line.unitPrice, line.taxRate);
    return invoice;
  }

  dashboard(): DashboardSnapshot {
    const count = (table: string) => Number((this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
    const today = new Date().toISOString();
    const attention = this.db.prepare("SELECT id,title,status,due_at FROM tasks WHERE due_at IS NOT NULL AND due_at <= ? AND status != 'done' ORDER BY due_at LIMIT 8").all(today) as Array<{ id: string; title: string; status: string; due_at: string | null }>;
    return {
      greeting: this.getPreferences().businessName ? `Good day, ${this.getPreferences().businessName}` : "Good day",
      date: new Intl.DateTimeFormat(this.getPreferences().locale === "ar" ? "ar-AE" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date()),
      offline: true,
      overdue: attention.length,
      counts: { customers: count("customers"), leads: count("leads"), jobs: count("jobs"), tasks: count("tasks"), invoices: count("invoices") },
      attention: attention.map((item) => ({ id: item.id, label: item.title, kind: item.status, dueAt: item.due_at })),
      timeline: this.listEvents().slice(0, 8).map((item) => ({ id: item.id, title: item.title, startAt: item.startAt, endAt: item.endAt, travelMinutes: item.travelMinutes, assignee: item.assignee }))
    };
  }

  search(query: string) {
    const kinds = Object.keys(tables) as EntityKind[];
    return kinds.flatMap((kind) => this.list(kind, query).slice(0, 30).map((item) => ({ ...item, kind })));
  }

  backup(label = "manual") {
    const dir = join(dirname(this.filePath), "backups"); mkdirSync(dir, { recursive: true });
    const target = join(dir, `tasko-${label}-${new Date().toISOString().replaceAll(":", "-")}.db`);
    this.db.pragma("wal_checkpoint(FULL)"); copyFileSync(this.filePath, target); return target;
  }
}
