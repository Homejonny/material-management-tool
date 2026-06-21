import { Router } from "express";
import nodemailer from "nodemailer";
import { db, rfqsTable, rfqRecipientsTable, offersTable, genericMaterialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

const SENDER = {
  name: "GMP Pharma d.o.o.",
  address: "Obrtna cona Logatec 10",
  city: "1370 Logatec",
  country: "Slovenija",
  email1: "info@gmp-pharma.eu",
  email2: "janez@gmp-pharma.eu",
};

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    tls: { rejectUnauthorized: false },
  });
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("sl-SI", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return iso; }
}

function todayFmt() {
  return new Date().toLocaleDateString("sl-SI", { day: "2-digit", month: "long", year: "numeric" });
}

function buildRfqHtml(opts: {
  eng: boolean;
  vendorName: string;
  vendorEmail: string;
  vendorContact?: string;
  vendorCountry?: string;
  materialName: string;
  vendorItemNo: string;
  vendorItemName: string;
  quantity: number;
  uom: string;
  requestedDate: string;
  notes: string;
}) {
  const { eng } = opts;
  const t = eng ? {
    dateLabel: "Date", subject: "Subject: Request for Quotation — Raw Materials",
    greeting: "Dear Sir/Madam,",
    body: "In accordance with our current production requirements, we kindly request your quotation for the following material. Please provide unit price, lead time, and minimum order quantity.",
    colItem: "Item No.", colDesc: "Material Description", colQty: "Quantity", colUnit: "Unit", colDate: "Req. Date",
    closing: "Please send us your offer at your earliest convenience.",
    farewell: "Thank you and kind regards,", dept: "Procurement Department",
    contactPrefix: "Attn:",
  } : {
    dateLabel: "Datum", subject: "Zadeva: Povpraševanje za dobavo materialov",
    greeting: "Spoštovani,",
    body: "v skladu z našimi trenutnimi potrebami za proizvodnjo vas prosimo za ponudbo za spodaj navedeni material. Prosimo navedite enoto ceno, dobavni rok in minimalno količino naročila.",
    colItem: "Šifra", colDesc: "Opis materiala", colQty: "Količina", colUnit: "Enota", colDate: "Žel. datum",
    closing: "Prosimo vas, da nam pošljete vašo ponudbo čim prej.",
    farewell: "Hvala za vaše hitro odzivanje in lep pozdrav,", dept: "Sektor nabave",
    contactPrefix: "g./ga.",
  };

  const qtyFmt = opts.quantity.toLocaleString(eng ? "en-GB" : "sl-SI", { maximumFractionDigits: 2 });
  const itemNo = opts.vendorItemNo || "—";
  const itemName = opts.vendorItemName || opts.materialName;
  const dateFmt = fmtDate(opts.requestedDate);
  const noteRow = opts.notes ? `<p style="color:#374151;font-size:13px;margin:0 0 24px"><em>${opts.notes}</em></p>` : "";

  return `<!DOCTYPE html><html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:40px">
<tr><td>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
    <tr>
      <td style="vertical-align:top">
        <div style="font-size:17px;font-weight:bold;color:#111827">${SENDER.name}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:4px">${SENDER.address}, ${SENDER.city}</div>
        <div style="font-size:11px;color:#9ca3af">${SENDER.country}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:4px">${SENDER.email1} · ${SENDER.email2}</div>
      </td>
      <td style="text-align:right;vertical-align:top">
        <div style="font-size:11px;color:#9ca3af;font-weight:600">${t.dateLabel}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${todayFmt()}</div>
      </td>
    </tr>
  </table>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px">
  <div style="margin-bottom:24px">
    <div style="font-weight:600;color:#111827">${opts.vendorName}</div>
    ${opts.vendorContact ? `<div style="color:#6b7280;font-size:13px">${t.contactPrefix} ${opts.vendorContact}</div>` : ""}
    ${opts.vendorEmail ? `<div style="color:#9ca3af;font-size:11px;margin-top:4px">${opts.vendorEmail}</div>` : ""}
  </div>
  <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:20px">${t.subject}</div>
  <p style="color:#374151;font-size:13px;margin:0 0 6px">${t.greeting}</p>
  <p style="color:#374151;font-size:13px;margin:0 0 24px">${t.body}</p>
  ${noteRow}
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-size:12px">${t.colItem}</th>
        <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-size:12px">${t.colDesc}</th>
        <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:right;font-size:12px">${t.colQty}</th>
        <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-size:12px">${t.colUnit}</th>
        <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-size:12px">${t.colDate}</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#ffffff">
        <td style="border:1px solid #d1d5db;padding:6px 10px;font-family:monospace;font-size:12px">${itemNo}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;font-size:12px">${itemName}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;text-align:right;font-size:12px;font-weight:600">${qtyFmt}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;text-align:center;font-size:12px">${opts.uom}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;text-align:center;font-size:12px">${dateFmt}</td>
      </tr>
    </tbody>
  </table>
  <p style="color:#374151;font-size:13px;margin:0 0 24px">${t.closing}</p>
  <p style="color:#374151;font-size:13px;margin:0 0 32px">${t.farewell}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px">
  <div style="font-weight:600;color:#111827;font-size:13px">${SENDER.name}</div>
  <div style="color:#9ca3af;font-size:11px">${t.dept}</div>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

const createRfqSchema = z.object({
  genericMaterialId: z.number().int().positive(),
  quantity: z.number().positive(),
  uom: z.string().default("KG"),
  requestedDate: z.string().default(""),
  notes: z.string().default(""),
  recipients: z.array(z.object({
    vendorNo: z.string().default(""),
    vendorName: z.string().min(1),
    vendorEmail: z.string().min(1),
    vendorItemNo: z.string().default(""),
    vendorItemName: z.string().default(""),
    vendorCountry: z.string().default(""),
  })).min(1),
  sendEmails: z.boolean().default(true),
});

const offerSchema = z.object({
  vendorNo: z.string().default(""),
  vendorName: z.string().min(1),
  unitPrice: z.number().nullable().default(null),
  currency: z.string().default("EUR"),
  deliveryDays: z.number().int().nullable().default(null),
  moq: z.number().nullable().default(null),
  validUntil: z.string().default(""),
  notes: z.string().default(""),
});

// GET /api/rfqs
router.get("/rfqs", async (req, res) => {
  try {
    const rfqs = await db.select().from(rfqsTable).orderBy(rfqsTable.createdAt);
    const recipients = await db.select().from(rfqRecipientsTable);
    const offers = await db.select().from(offersTable);
    const materials = await db.select().from(genericMaterialsTable);

    const materialMap = new Map(materials.map((m) => [m.id, m]));
    const recipientsByRfq = new Map<number, typeof recipients>();
    for (const r of recipients) {
      if (!recipientsByRfq.has(r.rfqId)) recipientsByRfq.set(r.rfqId, []);
      recipientsByRfq.get(r.rfqId)!.push(r);
    }
    const offersByRfq = new Map<number, typeof offers>();
    for (const o of offers) {
      if (!offersByRfq.has(o.rfqId)) offersByRfq.set(o.rfqId, []);
      offersByRfq.get(o.rfqId)!.push(o);
    }

    res.json(rfqs.map((rfq) => ({
      ...rfq,
      quantity: parseFloat(String(rfq.quantity)),
      material: materialMap.get(rfq.genericMaterialId) ?? null,
      recipients: recipientsByRfq.get(rfq.id) ?? [],
      offers: (offersByRfq.get(rfq.id) ?? []).map((o) => ({
        ...o,
        unitPrice: o.unitPrice != null ? parseFloat(String(o.unitPrice)) : null,
        moq: o.moq != null ? parseFloat(String(o.moq)) : null,
      })),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list RFQs");
    res.status(500).json({ error: "Napaka pri nalaganju" });
  }
});

// POST /api/rfqs — create + optionally send emails
router.post("/rfqs", async (req, res) => {
  try {
    const data = createRfqSchema.parse(req.body);

    // Fetch material name for the email
    const [material] = await db.select().from(genericMaterialsTable)
      .where(eq(genericMaterialsTable.id, data.genericMaterialId));
    if (!material) { res.status(404).json({ error: "Material ni najden" }); return; }

    // Insert RFQ
    const [rfq] = await db.insert(rfqsTable).values({
      genericMaterialId: data.genericMaterialId,
      quantity: String(data.quantity),
      uom: data.uom,
      requestedDate: data.requestedDate,
      notes: data.notes,
      sentAt: data.sendEmails ? new Date() : null,
    }).returning();

    // Insert recipients
    type Recipient = typeof data.recipients[number];
    await db.insert(rfqRecipientsTable).values(
      data.recipients.map((r: Recipient) => ({ ...r, rfqId: rfq.id, status: "sent" }))
    );

    // Send emails if requested
    const emailErrors: string[] = [];
    if (data.sendEmails) {
      const transporter = createTransport();
      for (const r of data.recipients) {
        try {
          const eng = r.vendorCountry !== "" && r.vendorCountry !== "SI";
          const html = buildRfqHtml({
            eng,
            vendorName: r.vendorName,
            vendorEmail: r.vendorEmail,
            vendorCountry: r.vendorCountry,
            materialName: material.name,
            vendorItemNo: r.vendorItemNo,
            vendorItemName: r.vendorItemName,
            quantity: data.quantity,
            uom: data.uom,
            requestedDate: data.requestedDate,
            notes: data.notes,
          });
          const subject = eng
            ? "Request for Quotation — Raw Materials"
            : "Povpraševanje za dobavo materialov";
          await transporter.sendMail({
            from: `"${SENDER.name}" <${process.env.SMTP_USER}>`,
            to: r.vendorEmail,
            subject,
            html,
          });
          req.log.info({ to: r.vendorEmail, vendor: r.vendorName }, "RFQ email sent");
        } catch (emailErr) {
          req.log.error({ emailErr, vendor: r.vendorName }, "Failed to send RFQ email");
          emailErrors.push(r.vendorName);
        }
      }
    }

    res.json({ rfqId: rfq.id, sent: data.sendEmails, emailErrors });
  } catch (err) {
    req.log.error({ err }, "Failed to create RFQ");
    res.status(400).json({ error: "Napaka pri ustvarjanju povpraševanja" });
  }
});

// DELETE /api/rfqs/:id
router.delete("/rfqs/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(rfqsTable).where(eq(rfqsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete RFQ");
    res.status(500).json({ error: "Napaka pri brisanju" });
  }
});

// GET /api/rfqs/:id/offers
router.get("/rfqs/:id/offers", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const offers = await db.select().from(offersTable).where(eq(offersTable.rfqId, id));
    res.json(offers.map((o) => ({
      ...o,
      unitPrice: o.unitPrice != null ? parseFloat(String(o.unitPrice)) : null,
      moq: o.moq != null ? parseFloat(String(o.moq)) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list offers");
    res.status(500).json({ error: "Napaka pri nalaganju ponudb" });
  }
});

// POST /api/rfqs/:id/offers
router.post("/rfqs/:id/offers", async (req, res) => {
  try {
    const rfqId = parseInt(req.params.id, 10);
    const data = offerSchema.parse(req.body);
    const [inserted] = await db.insert(offersTable).values({
      rfqId,
      vendorNo: data.vendorNo,
      vendorName: data.vendorName,
      unitPrice: data.unitPrice != null ? String(data.unitPrice) : null,
      currency: data.currency,
      deliveryDays: data.deliveryDays,
      moq: data.moq != null ? String(data.moq) : null,
      validUntil: data.validUntil,
      notes: data.notes,
    }).returning();
    res.json({ ...inserted, unitPrice: inserted.unitPrice != null ? parseFloat(String(inserted.unitPrice)) : null });
  } catch (err) {
    req.log.error({ err }, "Failed to add offer");
    res.status(400).json({ error: "Napaka pri dodajanju ponudbe" });
  }
});

// PUT /api/rfqs/:id/offers/:oid
router.put("/rfqs/:id/offers/:oid", async (req, res) => {
  try {
    const oid = parseInt(req.params.oid, 10);
    const data = offerSchema.parse(req.body);
    const [updated] = await db.update(offersTable).set({
      vendorNo: data.vendorNo,
      vendorName: data.vendorName,
      unitPrice: data.unitPrice != null ? String(data.unitPrice) : null,
      currency: data.currency,
      deliveryDays: data.deliveryDays,
      moq: data.moq != null ? String(data.moq) : null,
      validUntil: data.validUntil,
      notes: data.notes,
    }).where(eq(offersTable.id, oid)).returning();
    if (!updated) { res.status(404).json({ error: "Ni najdeno" }); return; }
    res.json({ ...updated, unitPrice: updated.unitPrice != null ? parseFloat(String(updated.unitPrice)) : null });
  } catch (err) {
    req.log.error({ err }, "Failed to update offer");
    res.status(400).json({ error: "Napaka pri posodabljanju" });
  }
});

// DELETE /api/rfqs/:id/offers/:oid
router.delete("/rfqs/:id/offers/:oid", async (req, res) => {
  try {
    const oid = parseInt(req.params.oid, 10);
    await db.delete(offersTable).where(eq(offersTable.id, oid));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete offer");
    res.status(500).json({ error: "Napaka pri brisanju" });
  }
});

export default router;
