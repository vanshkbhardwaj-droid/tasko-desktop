import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { LocalDatabase } from "./database";

const money = (value: number, currency: string) => new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);

export async function createInvoicePdf(database: LocalDatabase, invoiceId: string, documentsPath: string, assetsPath: string) {
  const invoice = database.get("invoice", invoiceId);
  const data = invoice.data ?? {};
  const lines = Array.isArray(data.lines) ? data.lines as Array<{ description: string; quantity: number; unitPrice: number; taxRate: number }> : [];
  const title = `${String(data.kind ?? "invoice").replace("-", " ").toUpperCase()} · ${invoice.title}`;
  const safeName = invoice.title.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").toLowerCase() || "document";
  const output = join(documentsPath, `${safeName}-${invoice.id.slice(0, 8)}.pdf`);
  mkdirSync(dirname(output), { recursive: true });

  const qr = await QRCode.toDataURL(`tasko://document/${invoice.id}`, { margin: 0, width: 128, color: { dark: "#0B0F17", light: "#FFFFFF" } });
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 54, info: { Title: title, Author: "Tasko" }, tagged: true, lang: "en-AE" });
    const arabicFont = join(assetsPath, "fonts", "NotoSansArabic-Variable.ttf");
    if (existsSync(arabicFont)) doc.registerFont("TaskoArabic", arabicFont);
    const useDocumentFont = (value: string) => /[\u0600-\u06ff]/.test(value) && existsSync(arabicFont) ? doc.font("TaskoArabic") : doc.font("Helvetica");
    const stream = createWriteStream(output);
    doc.pipe(stream);
    doc.fillColor("#0B0F17").fontSize(28).text("TASKO", 54, 54, { characterSpacing: 2 });
    doc.fillColor("#6A7182").fontSize(10).text("LOCALLY GENERATED DOCUMENT", 54, 90, { characterSpacing: 1 });
    useDocumentFont(title).fillColor("#0B0F17").fontSize(22).text(title, 54, 132);
    doc.fillColor("#6A7182").fontSize(10).text(`Document ID  ${invoice.id.slice(0, 8).toUpperCase()}\nIssued  ${new Intl.DateTimeFormat("en-GB").format(new Date(invoice.createdAt))}\nDue  ${invoice.dueAt ? new Intl.DateTimeFormat("en-GB").format(new Date(invoice.dueAt)) : "Not set"}`, 54, 170);
    doc.image(Buffer.from(qr.split(",")[1], "base64"), 440, 54, { width: 76 });
    const top = 274;
    doc.fillColor("#F4F6FA").rect(54, top, 487, 24).fill();
    doc.fillColor("#3D4656").fontSize(9).text("DESCRIPTION", 66, top + 8).text("QTY", 325, top + 8).text("RATE", 378, top + 8).text("TOTAL", 465, top + 8, { width: 65, align: "right" });
    let y = top + 40;
    for (const line of lines) {
      const total = line.quantity * line.unitPrice * (1 + line.taxRate / 100);
      useDocumentFont(line.description).fillColor("#0B0F17").fontSize(10).text(line.description, 66, y, { width: 245, align: /[\u0600-\u06ff]/.test(line.description) ? "right" : "left" });
      doc.text(String(line.quantity), 325, y, { width: 35, align: "right" });
      doc.text(money(line.unitPrice, invoice.currency ?? "AED"), 370, y, { width: 85, align: "right" });
      doc.text(money(total, invoice.currency ?? "AED"), 460, y, { width: 70, align: "right" });
      y += 26;
    }
    doc.strokeColor("#DCE1EA").moveTo(54, y + 3).lineTo(541, y + 3).stroke();
    doc.fillColor("#6A7182").fontSize(10).text("TOTAL", 364, y + 18, { width: 80, align: "right" });
    doc.fillColor("#0B0F17").fontSize(18).text(money(invoice.amount ?? 0, invoice.currency ?? "AED"), 450, y + 14, { width: 80, align: "right" });
    doc.fillColor("#6A7182").fontSize(9).text("Tax rates are editable defaults. Confirm legal and tax treatment with a qualified accountant.", 54, 720, { width: 400 });
    doc.fillColor("#6A7182").text("Generated locally by Tasko · no customer data left this computer.", 54, 742);
    doc.end();
    stream.on("finish", resolve); stream.on("error", reject);
  });
  if (!existsSync(output)) throw new Error("The PDF could not be written.");
  return { path: output, name: `${safeName}.pdf` };
}
