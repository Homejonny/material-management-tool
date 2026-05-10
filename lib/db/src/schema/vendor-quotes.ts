import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorQuotesTable = pgTable("vendor_quotes", {
  id: serial("id").primaryKey(),
  vendorName: text("vendor_name").notNull(),
  vendorNo: text("vendor_no").notNull().default(""),
  itemNo: text("item_no").notNull(),
  itemDescription: text("item_description").notNull().default(""),
  price: numeric("price", { precision: 12, scale: 4 }),
  currency: text("currency").notNull().default("EUR"),
  quantity: numeric("quantity", { precision: 12, scale: 4 }),
  uom: text("uom").notNull().default(""),
  deliveryDays: integer("delivery_days"),
  validUntil: text("valid_until").notNull().default(""),
  notes: text("notes").notNull().default(""),
  sourceFile: text("source_file").notNull().default(""),
  rawText: text("raw_text").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVendorQuoteSchema = createInsertSchema(vendorQuotesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertVendorQuote = z.infer<typeof insertVendorQuoteSchema>;
export type VendorQuote = typeof vendorQuotesTable.$inferSelect;
