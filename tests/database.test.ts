import assert from "node:assert/strict";
import { mkdtempSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalDatabase } from "../src/main/database";
import { createInvoicePdf } from "../src/main/pdf";

const fresh = () => new LocalDatabase(join(mkdtempSync(join(tmpdir(), "tasko-db-")), "tasko.sqlite"));

test("records persist locally and a lead can convert without creating the owner as a lead", () => {
  const database = fresh();
  const lead = database.create("lead", { title: "Cedar Studio", subtitle: "Referral", amount: 18000, currency: "AED" });
  const customer = database.convertLead(lead.id);
  assert.equal(customer.title, "Cedar Studio");
  assert.equal(database.get("lead", lead.id).status, "converted");
  assert.ok(database.list("customer").some((record) => record.id === customer.id));
  database.db.close();
});

test("calendar stores appointment details locally and rejects overlapping appointments for the same person", () => {
  const database = fresh();
  const start = "2026-10-24T09:00:00.000Z";
  const end = "2026-10-24T10:00:00.000Z";
  const appointment = database.create("event", { title: "First visit", subtitle: "Cedar Studio", startAt: start, endAt: end, assignee: "Aisha", travelMinutes: 25 });
  const saved = database.listEvents().find((event) => event.id === appointment.id);
  assert.deepEqual(saved && { title: saved.title, subtitle: saved.subtitle, startAt: saved.startAt, endAt: saved.endAt, assignee: saved.assignee, travelMinutes: saved.travelMinutes }, { title: "First visit", subtitle: "Cedar Studio", startAt: start, endAt: end, assignee: "Aisha", travelMinutes: 25 });
  assert.throws(() => database.create("event", { title: "Overlap", startAt: "2026-10-24T09:30:00.000Z", endAt: "2026-10-24T10:30:00.000Z", assignee: "Aisha" }), /overlaps/);
  database.db.close();
});

test("email drafts stay in the local database until explicitly opened in an email app", () => {
  const database = fresh();
  const draft = database.createInboxMessage({ recipient: "client@example.com", subject: "Design update", body: "Your local draft." });
  assert.deepEqual(database.listInboxMessages().map((message) => ({ recipient: message.recipient, subject: message.subject, body: message.body, status: message.status })), [{ recipient: "client@example.com", subject: "Design update", body: "Your local draft.", status: "draft" }]);
  const opened = database.markInboxMessageOpened(draft.id);
  assert.equal(opened.status, "opened");
  assert.ok(opened.openedAt);
  database.db.close();
});

test("team roster and availability stay local", () => {
  const database = fresh();
  const member = database.createTeamMember({ name: "Aisha Rahman", email: "aisha@example.com", role: "manager", capacity: 32, status: "active" });
  const away = database.setTeamAvailability(member.id, "away");
  assert.deepEqual({ name: away.name, email: away.email, role: away.role, capacity: away.capacity, status: away.status }, { name: "Aisha Rahman", email: "aisha@example.com", role: "manager", capacity: 32, status: "away" });
  assert.ok(database.listTeamMembers().some((item) => item.id === member.id));
  database.db.close();
});

test("invoice calculations and backups are local", () => {
  const database = fresh();
  const invoice = database.createInvoice({ title: "Design phase", currency: "AED", discount: 50, kind: "invoice", lines: [{ description: "Consultation", quantity: 2, unitPrice: 500, taxRate: 5 }] });
  assert.equal(invoice.amount, 1000);
  const backup = database.backup("test");
  assert.equal(existsSync(backup), true);
  database.db.close();
});

test("offline data survives a restart and invoice PDFs are generated locally", async () => {
  const folder = mkdtempSync(join(tmpdir(), "tasko-offline-"));
  const path = join(folder, "tasko.sqlite");
  const first = new LocalDatabase(path);
  const customer = first.create("customer", { title: "مكتب Cedar", subtitle: "Dubai" });
  const lead = first.create("lead", { title: "Offline enquiry", status: "new" });
  const invoice = first.createInvoice({ title: "استشارة Cedar", currency: "AED", discount: 0, kind: "invoice", lines: [{ description: "استشارة", quantity: 1, unitPrice: 500, taxRate: 5 }] });
  first.db.close();

  const restarted = new LocalDatabase(path);
  assert.equal(restarted.get("customer", customer.id).title, "مكتب Cedar");
  assert.equal(restarted.get("lead", lead.id).title, "Offline enquiry");
  const pdf = await createInvoicePdf(restarted, invoice.id, join(folder, "documents"), join(process.cwd(), "assets"));
  assert.equal(existsSync(pdf.path), true);
  assert.ok(statSync(pdf.path).size > 1_000);
  restarted.db.close();
});
