import { Router } from "express";
import { db, genericMaterialsTable, genericMaterialSuppliersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const BASE_URL = process.env.BC_URL!;
function bcAuth() {
  return "Basic " + Buffer.from(`${process.env.BC_USERNAME}:${process.env.BC_PASSWORD}`).toString("base64");
}
const HDR = () => ({ Authorization: bcAuth(), Accept: "application/json" });

async function bcGet<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { headers: HDR() });
  if (!res.ok) throw new Error(`BC ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { value: T[] };
  return json.value ?? [];
}

type BcItemInfo = {
  No: string;
  Description: string;
  Base_Unit_of_Measure: string;
  Vendor_No: string;
  Vendor_Item_No: string;
  Replenishment_System: string;
};

type BcVendorInfo = {
  No: string;
  Name: string;
  Country_Region_Code: string;
};

const materialSchema = z.object({
  genericCode: z.string().min(1),
  name: z.string().min(1),
  uom: z.string().default("KG"),
  notes: z.string().default(""),
});

const supplierSchema = z.object({
  vendorNo: z.string().default(""),
  vendorName: z.string().min(1),
  vendorEmail: z.string().default(""),
  vendorCountry: z.string().default(""),
  vendorItemNo: z.string().default(""),
  vendorItemName: z.string().default(""),
  notes: z.string().default(""),
});

// GET /api/generic-materials
router.get("/generic-materials", async (req, res) => {
  try {
    const materials = await db.select().from(genericMaterialsTable).orderBy(genericMaterialsTable.name);
    const suppliers = await db.select().from(genericMaterialSuppliersTable);
    const suppliersByMaterial = new Map<number, typeof suppliers>();
    for (const s of suppliers) {
      if (!suppliersByMaterial.has(s.genericMaterialId)) suppliersByMaterial.set(s.genericMaterialId, []);
      suppliersByMaterial.get(s.genericMaterialId)!.push(s);
    }
    const result = materials.map((m) => ({
      ...m,
      suppliers: suppliersByMaterial.get(m.id) ?? [],
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list generic materials");
    res.status(500).json({ error: "Napaka pri nalaganju" });
  }
});

// POST /api/generic-materials
router.post("/generic-materials", async (req, res) => {
  try {
    const data = materialSchema.parse(req.body);
    const [inserted] = await db.insert(genericMaterialsTable).values(data).returning();
    res.json(inserted);
  } catch (err) {
    req.log.error({ err }, "Failed to create generic material");
    res.status(400).json({ error: "Napaka pri ustvarjanju" });
  }
});

// PUT /api/generic-materials/:id
router.put("/generic-materials/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = materialSchema.parse(req.body);
    const [updated] = await db.update(genericMaterialsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(genericMaterialsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Ni najdeno" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update generic material");
    res.status(400).json({ error: "Napaka pri posodabljanju" });
  }
});

// DELETE /api/generic-materials/:id
router.delete("/generic-materials/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(genericMaterialsTable).where(eq(genericMaterialsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete generic material");
    res.status(500).json({ error: "Napaka pri brisanju" });
  }
});

// POST /api/generic-materials/:id/suppliers
router.post("/generic-materials/:id/suppliers", async (req, res) => {
  try {
    const genericMaterialId = parseInt(req.params.id, 10);
    const data = supplierSchema.parse(req.body);
    const [inserted] = await db.insert(genericMaterialSuppliersTable)
      .values({ ...data, genericMaterialId })
      .returning();
    res.json(inserted);
  } catch (err) {
    req.log.error({ err }, "Failed to add supplier");
    res.status(400).json({ error: "Napaka pri dodajanju dobavitelja" });
  }
});

// PUT /api/generic-materials/:id/suppliers/:sid
router.put("/generic-materials/:id/suppliers/:sid", async (req, res) => {
  try {
    const sid = parseInt(req.params.sid, 10);
    const data = supplierSchema.parse(req.body);
    const [updated] = await db.update(genericMaterialSuppliersTable)
      .set(data)
      .where(eq(genericMaterialSuppliersTable.id, sid))
      .returning();
    if (!updated) { res.status(404).json({ error: "Ni najdeno" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update supplier");
    res.status(400).json({ error: "Napaka pri posodabljanju dobavitelja" });
  }
});

// DELETE /api/generic-materials/:id/suppliers/:sid
router.delete("/generic-materials/:id/suppliers/:sid", async (req, res) => {
  try {
    const sid = parseInt(req.params.sid, 10);
    await db.delete(genericMaterialSuppliersTable).where(eq(genericMaterialSuppliersTable.id, sid));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete supplier");
    res.status(500).json({ error: "Napaka pri brisanju" });
  }
});

// ─── BC Integration ───────────────────────────────────────────────────────────

// GET /api/bc-vendor-info?itemNo=000123
// Returns vendor info for a BC item (Vendor_No, Vendor_Item_No) + vendor name/country
router.get("/bc-vendor-info", async (req, res) => {
  try {
    const itemNo = String(req.query.itemNo ?? "").trim();
    if (!/^\d{1,20}$/.test(itemNo)) {
      res.status(400).json({ error: "Neveljavna šifra artikla" });
      return;
    }

    const items = await bcGet<BcItemInfo>(
      `${BASE_URL}/Item?$filter=No eq '${itemNo}'&$select=No,Description,Base_Unit_of_Measure,Vendor_No,Vendor_Item_No`
    );
    const item = items[0];
    if (!item) {
      res.status(404).json({ error: `Artikel ${itemNo} ni najden v BC` });
      return;
    }

    const vendorNo = item.Vendor_No?.trim() ?? "";
    let vendorName = "";
    let vendorCountry = "";

    if (vendorNo) {
      const vendors = await bcGet<BcVendorInfo>(
        `${BASE_URL}/Dobavitelji?$filter=No eq '${vendorNo}'&$select=No,Name,Country_Region_Code`
      );
      const vendor = vendors[0];
      if (vendor) {
        vendorName = vendor.Name?.trim() ?? "";
        vendorCountry = vendor.Country_Region_Code?.trim() ?? "";
      }
    }

    res.json({
      vendorNo,
      vendorName,
      vendorCountry,
      vendorItemNo: item.Vendor_Item_No?.trim() ?? "",
      vendorItemName: item.Description?.trim() ?? "",
      uom: item.Base_Unit_of_Measure?.trim() ?? "KG",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch BC vendor info");
    res.status(500).json({ error: "Napaka pri pridobivanju podatkov iz BC" });
  }
});

// Simple in-process cache for BC items (avoids re-fetching on every AI suggestion)
let bcItemsCache: BcItemInfo[] | null = null;
let bcItemsCacheAt = 0;
const BC_CACHE_TTL = 10 * 60 * 1000; // 10 min

async function getBcPurchaseItems(): Promise<BcItemInfo[]> {
  if (bcItemsCache && Date.now() - bcItemsCacheAt < BC_CACHE_TTL) return bcItemsCache;
  const items = await bcGet<BcItemInfo>(
    `${BASE_URL}/Item?$select=No,Description,Base_Unit_of_Measure,Vendor_No,Vendor_Item_No,Replenishment_System&$filter=Replenishment_System eq 'Purchase'&$top=1000`
  );
  bcItemsCache = items.filter(i => i.No?.trim() && i.Description?.trim());
  bcItemsCacheAt = Date.now();
  return bcItemsCache;
}

// POST /api/generic-materials/ai-suggest
// Body: { name: string, notes?: string }
// Returns: { suggestions: [...] }
router.post("/generic-materials/ai-suggest", async (req, res) => {
  try {
    const { name, notes } = req.body as { name?: string; notes?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "Manjka naziv materiala" });
      return;
    }

    const items = await getBcPurchaseItems();
    if (items.length === 0) {
      res.json({ suggestions: [] });
      return;
    }

    // Limit list sent to AI (keep first 300, prioritised by description similarity would be ideal,
    // but for simplicity we just send all purchase items up to 300)
    const itemList = items.slice(0, 300)
      .map(i => `${i.No.trim()}: ${i.Description.trim()}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a procurement assistant for GMP Pharma, a pharmaceutical company.
Your task: given a GENERIC material name (possibly a common name, INCI, or internal name),
identify which specific items from GMP Pharma's BC ERP purchase list are the same or equivalent material.

Return JSON only: {"matches": [{"no": "000123", "confidence": "high|medium|low", "reason": "brief explanation in Slovenian"}]}
Rules:
- Return at most 5 matches, ordered by confidence (highest first)
- Only include items that are genuinely likely to be the same material
- Consider synonyms, INCI names, trade names, abbreviations
- If nothing matches confidently, return fewer or no matches`,
        },
        {
          role: "user",
          content: `Generic material: "${name.trim()}"${notes?.trim() ? `\nAdditional notes: ${notes.trim()}` : ""}

BC purchase items:
${itemList}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { matches?: { no: string; confidence: string; reason: string }[] } = {};
    try { parsed = JSON.parse(content); } catch { /* ignore */ }
    const matches = parsed.matches ?? [];

    // Enrich with item + vendor details
    const suggestions = matches.map(m => {
      const item = items.find(i => i.No?.trim() === m.no);
      return {
        itemNo: m.no,
        itemDescription: item?.Description?.trim() ?? "",
        confidence: m.confidence,
        reason: m.reason,
        vendorNo: item?.Vendor_No?.trim() ?? "",
        vendorItemNo: item?.Vendor_Item_No?.trim() ?? "",
        uom: item?.Base_Unit_of_Measure?.trim() ?? "",
      };
    });

    // Enrich vendor names (batch fetch)
    const uniqueVendorNos = [...new Set(suggestions.map(s => s.vendorNo).filter(Boolean))];
    const vendorNames = new Map<string, string>();
    const vendorCountries = new Map<string, string>();
    if (uniqueVendorNos.length > 0) {
      const filter = uniqueVendorNos.map(n => `No eq '${n}'`).join(" or ");
      const vendors = await bcGet<BcVendorInfo>(
        `${BASE_URL}/Dobavitelji?$filter=${filter}&$select=No,Name,Country_Region_Code`
      );
      for (const v of vendors) {
        vendorNames.set(v.No.trim(), v.Name?.trim() ?? "");
        vendorCountries.set(v.No.trim(), v.Country_Region_Code?.trim() ?? "");
      }
    }

    res.json({
      suggestions: suggestions.map(s => ({
        ...s,
        vendorName: vendorNames.get(s.vendorNo) ?? "",
        vendorCountry: vendorCountries.get(s.vendorNo) ?? "",
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get AI suggestions");
    res.status(500).json({ error: "Napaka pri AI predlogih" });
  }
});

export default router;
