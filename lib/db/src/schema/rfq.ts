import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { genericMaterialsTable } from "./generic-materials";

export const rfqsTable = pgTable("rfqs", {
  id: serial("id").primaryKey(),
  genericMaterialId: integer("generic_material_id").notNull().references(() => genericMaterialsTable.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
  uom: text("uom").notNull().default("KG"),
  requestedDate: text("requested_date").notNull().default(""),
  notes: text("notes").notNull().default(""),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rfqRecipientsTable = pgTable("rfq_recipients", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => rfqsTable.id, { onDelete: "cascade" }),
  vendorNo: text("vendor_no").notNull().default(""),
  vendorName: text("vendor_name").notNull(),
  vendorEmail: text("vendor_email").notNull(),
  vendorItemNo: text("vendor_item_no").notNull().default(""),
  vendorItemName: text("vendor_item_name").notNull().default(""),
  vendorCountry: text("vendor_country").notNull().default(""),
  status: text("status").notNull().default("sent"),
});

export const offersTable = pgTable("offers", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => rfqsTable.id, { onDelete: "cascade" }),
  vendorNo: text("vendor_no").notNull().default(""),
  vendorName: text("vendor_name").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 4 }),
  currency: text("currency").notNull().default("EUR"),
  deliveryDays: integer("delivery_days"),
  moq: numeric("moq", { precision: 12, scale: 4 }),
  validUntil: text("valid_until").notNull().default(""),
  notes: text("notes").notNull().default(""),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRfqSchema = createInsertSchema(rfqsTable).omit({ id: true, sentAt: true, createdAt: true });
export const insertRfqRecipientSchema = createInsertSchema(rfqRecipientsTable).omit({ id: true });
export const insertOfferSchema = createInsertSchema(offersTable).omit({ id: true, receivedAt: true });

export type Rfq = typeof rfqsTable.$inferSelect;
export type InsertRfq = z.infer<typeof insertRfqSchema>;
export type RfqRecipient = typeof rfqRecipientsTable.$inferSelect;
export type Offer = typeof offersTable.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;
