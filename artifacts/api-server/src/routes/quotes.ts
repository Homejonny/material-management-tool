import { Router } from "express";
import pdfParse from "pdf-parse";
import multer from "multer";
import { db, vendorQuotesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type ParsedQuoteLine = {
  vendor_name: string;
  item_no: string;
  item_description: string;
  price: number | null;
  currency: string;
  quantity: number | null;
  uom: string;
  delivery_days: number | null;
  valid_until: string;
  notes: string;
};

function buildSystemPrompt(vendorHint?: string): string {
  const vendorLine = vendorHint
    ? `- vendor_name: ALWAYS use exactly "${vendorHint}" for every row — this is the supplier who sent the document.`
    : `- vendor_name: the SUPPLIER company name (the company sending the quote). IMPORTANT: "GMP Pharma d.o.o." and "GMP Pharma" is the BUYER/CUSTOMER — NEVER use it as vendor_name. Look for the actual supplier name in the email signature, "From:" field, sender's letterhead, or any company name other than GMP Pharma. If no other company is identifiable, leave vendor_name as "".`;

  return `You are a procurement assistant. Extract structured quote data from vendor emails, price lists, or screenshots.
Return a JSON object with a "lines" array. Each item in "lines" must have:
- ${vendorLine}
- item_no: string — GMP Pharma's internal 6-digit material code. Rules: (1) In structured vendor quotations look for a field labeled "Your Item Code", "Customer Item Code", "Customer Code", "Buyer Code", or similar — these contain GMP Pharma's 6-digit codes (e.g. "000024", "000133"). (2) In emails/text, if an item is referenced with "Pozicija" or "Pozicija:" followed by a number (e.g. "Pozicija: 152", "Pozicija:105"), that number IS the GMP internal code — pad it to 6 digits with leading zeros (152 → "000152"). (3) Must be exactly 6 digits with leading zeros. NEVER use the vendor's own product code unless it matches the 6-digit GMP format exactly. If no GMP code is identifiable, leave as "".
- item_description: string — full product/material name as written in the quote.
- price: number or null — unit price (numeric only, no currency symbols). Parse European decimals: "34,80" → 34.80.
- currency: string — "EUR", "USD", etc. Default "EUR".
- quantity: number or null — offered or minimum quantity.
- uom: string — unit of measure: "KG", "PCS", "L", etc. Default "KG" for extracts/powders.
- delivery_days: number or null — lead time in calendar days. Convert weeks: "4-5 tednov" → 32 (midpoint in days).
- valid_until: string — validity date ISO YYYY-MM-DD, or "".
- notes: string — any extra info: parity (CIP, CIF, EXW), payment terms, special conditions.

Extract EVERY product row from tables or lists. Do NOT skip any line item.
If a field cannot be determined, use null or "".`;
}

// ~4 chars per token; keep each chunk well under 20k tokens (system prompt ~800 + user content)
const MAX_CHUNK_CHARS = 14000;

async function parseQuoteChunk(chunk: string, sourceHint: string, vendorHint?: string): Promise<ParsedQuoteLine[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt(vendorHint) },
      { role: "user", content: `Source: ${sourceHint}\n\n${chunk}` },
    ],
  });
  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { lines?: ParsedQuoteLine[] };
  return parsed.lines ?? [];
}

async function parseQuoteText(text: string, sourceHint: string, vendorHint?: string): Promise<ParsedQuoteLine[]> {
  if (text.length <= MAX_CHUNK_CHARS) {
    return parseQuoteChunk(text, sourceHint, vendorHint);
  }

  // Split into overlapping chunks so items spanning chunk boundaries are not missed
  const overlap = 1000;
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + MAX_CHUNK_CHARS));
    start += MAX_CHUNK_CHARS - overlap;
  }

  // Parse each chunk sequentially (avoid hitting rate limits simultaneously)
  const allLines: ParsedQuoteLine[] = [];
  for (const chunk of chunks) {
    const lines = await parseQuoteChunk(chunk, sourceHint, vendorHint);
    allLines.push(...lines);
  }

  // Deduplicate: keep first occurrence of each (item_no+description+price) triple
  const seen = new Set<string>();
  return allLines.filter(line => {
    const key = `${line.item_no}|${line.item_description.trim().toLowerCase()}|${line.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function parseQuoteImage(imageBuffer: Buffer, mimeType: string, sourceHint: string, vendorHint?: string): Promise<ParsedQuoteLine[]> {
  const base64 = imageBuffer.toString("base64");
  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt(vendorHint) },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
          },
          { type: "text", text: `Source: ${sourceHint}\n\nExtract all quote/price data from this image.` },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { lines?: ParsedQuoteLine[] };
  return parsed.lines ?? [];
}

// POST /api/quotes/parse — parse text or uploaded file using AI
router.post("/quotes/parse", upload.single("file"), async (req, res) => {
  try {
    let text = "";
    let sourceHint = "pasted text";
    const vendorHint = req.body?.vendorHint ? String(req.body.vendorHint).trim() : undefined;

    const IMAGE_MIME: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };

    if (req.file) {
      const filename = req.file.originalname.toLowerCase();
      sourceHint = req.file.originalname;

      const imgExt = Object.keys(IMAGE_MIME).find((ext) => filename.endsWith(ext));
      if (imgExt) {
        const lines = await parseQuoteImage(req.file.buffer, IMAGE_MIME[imgExt]!, sourceHint, vendorHint);
        res.json({ lines, source: sourceHint, rawText: "" });
        return;
      } else if (filename.endsWith(".docx")) {
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = result.value;
      } else if (filename.endsWith(".pdf")) {
        const pdfData = await pdfParse(req.file.buffer);
        text = pdfData.text;
      } else {
        text = req.file.buffer.toString("utf-8");
      }
    } else if (req.body?.text) {
      text = String(req.body.text);
      sourceHint = "email / prilepljeno besedilo";
    } else {
      res.status(400).json({ error: "Podajte besedilo (text) ali priložite datoteko" });
      return;
    }

    if (!text.trim()) {
      res.status(400).json({ error: "Besedilo je prazno" });
      return;
    }

    const lines = await parseQuoteText(text, sourceHint, vendorHint);
    res.json({ lines, source: sourceHint, rawText: text.slice(0, 5000) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err, msg }, "Failed to parse quote");
    res.status(500).json({ error: "Napaka pri razčlenjevanju ponudbe", detail: msg });
  }
});

// POST /api/quotes — save one or more quote lines to DB
router.post("/quotes", async (req, res) => {
  try {
    const { lines, sourceFile, rawText } = req.body as {
      lines: ParsedQuoteLine[];
      sourceFile?: string;
      rawText?: string;
    };

    if (!Array.isArray(lines) || lines.length === 0) {
      res.status(400).json({ error: "Brez vrstic za shranjevanje" });
      return;
    }

    const inserted = await db.insert(vendorQuotesTable).values(
      lines.map((l) => ({
        vendorName: l.vendor_name ?? "",
        vendorNo: "",
        itemNo: l.item_no ?? "",
        itemDescription: l.item_description ?? "",
        price: l.price != null ? String(l.price) : null,
        currency: l.currency || "EUR",
        quantity: l.quantity != null ? String(l.quantity) : null,
        uom: l.uom ?? "",
        deliveryDays: l.delivery_days ?? null,
        validUntil: l.valid_until ?? "",
        notes: l.notes ?? "",
        sourceFile: sourceFile ?? "",
        rawText: rawText ?? "",
      }))
    ).returning();

    res.json({ saved: inserted.length, ids: inserted.map((r) => r.id) });
  } catch (err) {
    req.log.error({ err }, "Failed to save quotes");
    res.status(500).json({ error: "Napaka pri shranjevanju" });
  }
});

// GET /api/quotes — list all saved quotes (newest first)
router.get("/quotes", async (req, res) => {
  try {
    const rows = await db.select().from(vendorQuotesTable).orderBy(vendorQuotesTable.createdAt);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list quotes");
    res.status(500).json({ error: "Napaka pri nalaganju ponudb" });
  }
});

// DELETE /api/quotes/:id
router.delete("/quotes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Neveljaven ID" }); return; }
    await db.delete(vendorQuotesTable).where(eq(vendorQuotesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete quote");
    res.status(500).json({ error: "Napaka pri brisanju" });
  }
});

// Validate that an item_no is a proper 6-digit GMP internal code
function isValidItemNo(code: string | null | undefined): boolean {
  return /^\d{6}$/.test((code ?? "").trim());
}

// GET /api/quotes/comparison — comparison grouped by material description
router.get("/quotes/comparison", async (req, res) => {
  try {
    const rows = await db.select().from(vendorQuotesTable).orderBy(vendorQuotesTable.createdAt);

    // Group by normalised description (primary); fall back to 6-digit item_no when description is empty
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const desc = (row.itemDescription ?? "").trim();
      const itemNo = (row.itemNo ?? "").trim();
      const validNo = isValidItemNo(itemNo) ? itemNo : "";

      const key = desc.toLowerCase() || (validNo ? `no:${validNo}` : "");
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const result = [...groups.entries()].map(([, quotes]) => {
      const prices = quotes.filter((q) => q.price != null).map((q) => parseFloat(String(q.price)));
      const minPrice = prices.length > 0 ? Math.min(...prices) : null;

      // Use first non-empty description; find the 6-digit item_no if any row has one
      const canonicalDesc = quotes.find((q) => q.itemDescription?.trim())?.itemDescription?.trim() ?? "";
      const canonicalNo = quotes.find((q) => isValidItemNo(q.itemNo))?.itemNo?.trim() ?? "";

      return {
        canonical_description: canonicalDesc,
        canonical_item_no: canonicalNo,
        has_substitutes: false,
        substitute_item_nos: [] as string[],
        quotes: quotes.map((q) => ({
          ...q,
          price: q.price != null ? parseFloat(String(q.price)) : null,
          quantity: q.quantity != null ? parseFloat(String(q.quantity)) : null,
          is_best_price: q.price != null && parseFloat(String(q.price)) === minPrice,
        })),
      };
    }).sort((a, b) =>
      a.canonical_description.localeCompare(b.canonical_description, "sl", { sensitivity: "base" })
    );

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to build comparison");
    res.status(500).json({ error: "Napaka pri primerjavi" });
  }
});

export default router;
