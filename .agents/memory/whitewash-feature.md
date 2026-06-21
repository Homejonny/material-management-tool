---
name: Whitewash (Primerjalno RFQ) feature
description: Summary of what was built for the comparative RFQ system
---

Fully implemented and deployed. All 3 phases complete.

## DB tables (all pushed)
- `generic_materials` — generic cross-reference codes (id, genericCode, name, uom, notes)
- `generic_material_suppliers` — per-supplier item mappings (vendorName, vendorEmail, vendorItemNo, vendorItemName, vendorCountry)
- `rfqs` — comparative inquiry header (genericMaterialId, quantity, uom, requestedDate, notes, sentAt)
- `rfq_recipients` — per-vendor snapshot at send time
- `offers` — received quotes (unitPrice, currency, deliveryDays, moq, validUntil)

## API routes (registered in routes/index.ts)
- `artifacts/api-server/src/routes/generic-materials.ts` — CRUD + supplier CRUD
- `artifacts/api-server/src/routes/rfq.ts` — RFQ create+email send + offers CRUD

## Frontend
- `artifacts/data-app/src/pages/WhitewashPage.tsx` — 2 tabs: Generične kode + Povpraševanja (RFQ)
- Registered in App.tsx as "Primerjalno RFQ" with GitCompareArrows icon

**Why:** GMP Pharma needs to compare the same raw material across multiple suppliers with different item numbers, send per-vendor inquiry emails in SL/EN based on country, and record + compare received offers.
