import { Router } from "express";
import { db, genericMaterialsTable, genericMaterialSuppliersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

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
    res.status(500).json({ error: "Napaka pri brisanju dobavitelja" });
  }
});

export default router;
