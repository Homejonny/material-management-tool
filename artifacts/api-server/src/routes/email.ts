import { Router } from "express";
import nodemailer from "nodemailer";

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
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
  });
}

type InquiryItem = {
  st: string;
  opis: string;
  uom: string;
  qty: number;
  date: string;
  vendor_item_no: string;
};

function fmtDate(iso: string) {
  if (!iso || iso === "—" || iso <= "0001-01-01") return "—";
  try {
    return new Date(iso).toLocaleDateString("sl-SI", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

function todayFmt() {
  return new Date().toLocaleDateString("sl-SI", { day: "2-digit", month: "long", year: "numeric" });
}

function buildHtml(opts: {
  eng: boolean;
  vendorName: string;
  vendorName2: string;
  vendorAddress: string;
  vendorPostCode: string;
  vendorCity: string;
  vendorCountry: string;
  vendorContact: string;
  vendorEmail: string;
  vendorPhone: string;
  items: InquiryItem[];
}) {
  const { eng, items } = opts;
  const t = eng ? {
    dateLabel: "Date",
    contactPrefix: "Attn:",
    subject: "Subject: Request for Quotation — Raw Materials",
    greeting: "Dear Sir/Madam,",
    body: "In accordance with our current production requirements, we kindly request your confirmation of availability and pricing for the materials listed below. Please provide a quotation including unit prices and estimated delivery dates.",
    colCode: "Item No.",
    colDesc: "Material Description",
    colQty: "Quantity",
    colUnit: "Unit",
    colVendorRef: "Vendor Ref.",
    colDate: "Req. Date",
    closing: "Please send us your quotation at your earliest convenience. Should you have any questions, do not hesitate to contact us at the details above.",
    farewell: "Thank you for your prompt response. Kind regards,",
    dept: "Procurement Department",
  } : {
    dateLabel: "Datum",
    contactPrefix: "g./ga.",
    subject: "Zadeva: Povpraševanje za dobavo materialov",
    greeting: "Spoštovani,",
    body: "v skladu z našimi trenutnimi potrebami za proizvodnjo vas prosimo za potrditev razpoložljivosti in cen za spodaj navedene materiale. Prosimo za ponudbo s cenami in predvidenim datumom dobave.",
    colCode: "Šifra",
    colDesc: "Opis materiala",
    colQty: "Količina",
    colUnit: "Enota",
    colVendorRef: "Šifra dob.",
    colDate: "Žel. datum",
    closing: "Prosimo vas, da nam pošljete vašo ponudbo čim prej. Za morebitna vprašanja smo vam na voljo na zgornji kontaktni številki ali e-poštnem naslovu.",
    farewell: "Hvala za vaše hitro odzivanje in lep pozdrav,",
    dept: "Sektor nabave",
  };

  const numFmt = eng ? "en-GB" : "sl-SI";
  const addressLine = [opts.vendorPostCode, opts.vendorCity].filter(Boolean).join(" ");

  const sortedItems = [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.st.localeCompare(b.st);
  });

  const rows = sortedItems.map((item, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
    const qtyFmt = item.qty.toLocaleString(numFmt, { maximumFractionDigits: 2 });
    const dateFmt = fmtDate(item.date);
    return `
      <tr style="background:${bg}">
        <td style="border:1px solid #d1d5db;padding:6px 10px;font-family:monospace;font-size:12px">${item.st}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;font-size:12px">${item.opis}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;text-align:right;font-size:12px;font-weight:600">${qtyFmt}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;text-align:center;font-size:12px">${item.uom || "—"}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;font-size:12px;color:#6b7280">${item.vendor_item_no || "—"}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;text-align:center;font-size:12px">${dateFmt}</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:40px">
<tr><td>

  <!-- Header -->
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

  <!-- Recipient -->
  <div style="margin-bottom:24px">
    <div style="font-weight:600;color:#111827">${opts.vendorName}</div>
    ${opts.vendorName2 ? `<div style="color:#6b7280;font-size:13px">${opts.vendorName2}</div>` : ""}
    ${opts.vendorContact ? `<div style="color:#6b7280;font-size:13px">${t.contactPrefix} ${opts.vendorContact}</div>` : ""}
    ${opts.vendorAddress ? `<div style="color:#6b7280;font-size:13px">${opts.vendorAddress}</div>` : ""}
    ${addressLine ? `<div style="color:#6b7280;font-size:13px">${addressLine}</div>` : ""}
    ${opts.vendorCountry ? `<div style="color:#6b7280;font-size:13px">${opts.vendorCountry}</div>` : ""}
    ${opts.vendorEmail ? `<div style="color:#9ca3af;font-size:11px;margin-top:4px">${opts.vendorEmail}</div>` : ""}
  </div>

  <!-- Subject -->
  <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:20px">${t.subject}</div>

  <!-- Body -->
  <p style="color:#374151;font-size:13px;margin:0 0 6px">${t.greeting}</p>
  <p style="color:#374151;font-size:13px;margin:0 0 24px">${t.body}</p>

  <!-- Table -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-size:12px;white-space:nowrap">${t.colCode}</th>
        <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-size:12px">${t.colDesc}</th>
        <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:right;font-size:12px;white-space:nowrap">${t.colQty}</th>
        <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-size:12px">${t.colUnit}</th>
        <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-size:12px;white-space:nowrap">${t.colVendorRef}</th>
        <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-size:12px;white-space:nowrap">${t.colDate}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- Closing -->
  <p style="color:#374151;font-size:13px;margin:0 0 24px">${t.closing}</p>
  <p style="color:#374151;font-size:13px;margin:0 0 32px">${t.farewell}</p>

  <!-- Footer -->
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px">
  <div style="font-weight:600;color:#111827;font-size:13px">${SENDER.name}</div>
  <div style="color:#9ca3af;font-size:11px">${t.dept}</div>

</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// POST /api/email/inquiry
router.post("/email/inquiry", async (req, res) => {
  try {
    const {
      to,
      vendorName,
      vendorName2,
      vendorAddress,
      vendorPostCode,
      vendorCity,
      vendorCountry,
      vendorContact,
      vendorPhone,
      eng,
      items,
    } = req.body as {
      to: string;
      vendorName: string;
      vendorName2?: string;
      vendorAddress?: string;
      vendorPostCode?: string;
      vendorCity?: string;
      vendorCountry?: string;
      vendorContact?: string;
      vendorPhone?: string;
      eng: boolean;
      items: InquiryItem[];
    };

    if (!to || !items?.length) {
      res.status(400).json({ error: "Manjka e-poštni naslov ali seznam artiklov" });
      return;
    }

    const subject = eng
      ? "Request for Quotation — Raw Materials"
      : "Povpraševanje za dobavo materialov";

    const html = buildHtml({
      eng,
      vendorName,
      vendorName2: vendorName2 ?? "",
      vendorAddress: vendorAddress ?? "",
      vendorPostCode: vendorPostCode ?? "",
      vendorCity: vendorCity ?? "",
      vendorCountry: vendorCountry ?? "",
      vendorContact: vendorContact ?? "",
      vendorEmail: to,
      vendorPhone: vendorPhone ?? "",
      items,
    });

    const transporter = createTransport();
    await transporter.sendMail({
      from: `"${SENDER.name}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });

    req.log.info({ to, vendorName, itemCount: items.length }, "Inquiry email sent");
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to send inquiry email");
    res.status(500).json({ error: "Napaka pri pošiljanju e-pošte" });
  }
});

export default router;
