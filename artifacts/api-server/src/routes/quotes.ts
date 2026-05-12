import { Router } from "express";
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

async function parseQuoteText(text: string, sourceHint: string): Promise<ParsedQuoteLine[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a procurement assistant. Extract structured quote data from vendor responses.
Return a JSON object with a "lines" array. Each item in "lines" must have:
- vendor_name: string (vendor/supplier name)
- item_no: string (material/item code, often 6-digit number like 000024, or vendor's own code)
- item_description: string (material description)
- price: number or null (unit price)
- currency: string (e.g. "EUR", "USD" — default "EUR")
- quantity: number or null (offered/minimum quantity)
- uom: string (unit of measure, e.g. "KG", "PCS", "L")
- delivery_days: number or null (lead time in calendar days)
- valid_until: string (validity date in ISO format YYYY-MM-DD, or "")
- notes: string (any additional info, special conditions)

Extract ALL line items from the quote. If vendor name is not clear, use what you can infer.
If a field cannot be determined, use null or "".`,
      },
      {
        role: "user",
        content: `Source: ${sourceHint}\n\n${text}`,
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

    if (req.file) {
      const filename = req.file.originalname.toLowerCase();
      sourceHint = req.file.originalname;

      if (filename.endsWith(".docx")) {
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = result.value;
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

    const lines = await parseQuoteText(text, sourceHint);
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

// GET /api/quotes/comparison — comparison grouped by material
// NOTE: substitute grouping removed — BC OData for table 5715 not published
router.get("/quotes/comparison", async (req, res) => {
  try {
    const rows = await db.select().from(vendorQuotesTable).orderBy(vendorQuotesTable.createdAt);

    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.itemNo?.trim();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const result = [...groups.entries()].map(([itemNo, quotes]) => {
      const prices = quotes.filter((q) => q.price != null).map((q) => parseFloat(String(q.price)));
      const minPrice = prices.length > 0 ? Math.min(...prices) : null;
      return {
        canonical_item_no: itemNo,
        has_substitutes: false,
        substitute_item_nos: [] as string[],
        quotes: quotes.map((q) => ({
          ...q,
          price: q.price != null ? parseFloat(String(q.price)) : null,
          quantity: q.quantity != null ? parseFloat(String(q.quantity)) : null,
          is_best_price: q.price != null && parseFloat(String(q.price)) === minPrice,
        })),
      };
    }).sort((a, b) => a.canonical_item_no.localeCompare(b.canonical_item_no));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to build comparison");
    res.status(500).json({ error: "Napaka pri primerjavi" });
  }
});

export default router;
