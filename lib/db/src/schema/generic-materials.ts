import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const genericMaterialsTable = pgTable("generic_materials", {
  id: serial("id").primaryKey(),
  genericCode: text("generic_code").notNull().unique(),
  name: text("name").notNull(),
  uom: text("uom").notNull().default("KG"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const genericMaterialSuppliersTable = pgTable("generic_material_suppliers", {
  id: serial("id").primaryKey(),
  genericMaterialId: serial("generic_material_id").notNull().references(() => genericMaterialsTable.id, { onDelete: "cascade" }),
  vendorNo: text("vendor_no").notNull().default(""),
  vendorName: text("vendor_name").notNull(),
  vendorEmail: text("vendor_email").notNull().default(""),
  vendorCountry: text("vendor_country").notNull().default(""),
  vendorItemNo: text("vendor_item_no").notNull().default(""),
  vendorItemName: text("vendor_item_name").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGenericMaterialSchema = createInsertSchema(genericMaterialsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGenericMaterialSupplierSchema = createInsertSchema(genericMaterialSuppliersTable).omit({ id: true, createdAt: true });

export type GenericMaterial = typeof genericMaterialsTable.$inferSelect;
export type InsertGenericMaterial = z.infer<typeof insertGenericMaterialSchema>;
export type GenericMaterialSupplier = typeof genericMaterialSuppliersTable.$inferSelect;
export type InsertGenericMaterialSupplier = z.infer<typeof insertGenericMaterialSupplierSchema>;
