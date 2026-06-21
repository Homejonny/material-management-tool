-- Migration: add generic_materials, generic_material_suppliers, rfqs, rfq_recipients, offers
-- vendor_quotes already exists in production — skip it

CREATE TABLE IF NOT EXISTS "generic_materials" (
        "id" serial PRIMARY KEY NOT NULL,
        "generic_code" text NOT NULL,
        "name" text NOT NULL,
        "uom" text DEFAULT 'KG' NOT NULL,
        "notes" text DEFAULT '' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "generic_materials_generic_code_unique" UNIQUE("generic_code")
);

CREATE TABLE IF NOT EXISTS "generic_material_suppliers" (
        "id" serial PRIMARY KEY NOT NULL,
        "generic_material_id" integer NOT NULL,
        "vendor_no" text DEFAULT '' NOT NULL,
        "vendor_name" text NOT NULL,
        "vendor_email" text DEFAULT '' NOT NULL,
        "vendor_country" text DEFAULT '' NOT NULL,
        "vendor_item_no" text DEFAULT '' NOT NULL,
        "vendor_item_name" text DEFAULT '' NOT NULL,
        "notes" text DEFAULT '' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rfqs" (
        "id" serial PRIMARY KEY NOT NULL,
        "generic_material_id" integer NOT NULL,
        "quantity" numeric(12, 4) NOT NULL,
        "uom" text DEFAULT 'KG' NOT NULL,
        "requested_date" text DEFAULT '' NOT NULL,
        "notes" text DEFAULT '' NOT NULL,
        "sent_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rfq_recipients" (
        "id" serial PRIMARY KEY NOT NULL,
        "rfq_id" integer NOT NULL,
        "vendor_no" text DEFAULT '' NOT NULL,
        "vendor_name" text NOT NULL,
        "vendor_email" text NOT NULL,
        "vendor_item_no" text DEFAULT '' NOT NULL,
        "vendor_item_name" text DEFAULT '' NOT NULL,
        "vendor_country" text DEFAULT '' NOT NULL,
        "status" text DEFAULT 'sent' NOT NULL
);

CREATE TABLE IF NOT EXISTS "offers" (
        "id" serial PRIMARY KEY NOT NULL,
        "rfq_id" integer NOT NULL,
        "vendor_no" text DEFAULT '' NOT NULL,
        "vendor_name" text NOT NULL,
        "unit_price" numeric(12, 4),
        "currency" text DEFAULT 'EUR' NOT NULL,
        "delivery_days" integer,
        "moq" numeric(12, 4),
        "valid_until" text DEFAULT '' NOT NULL,
        "notes" text DEFAULT '' NOT NULL,
        "received_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "generic_material_suppliers"
        DROP CONSTRAINT IF EXISTS "generic_material_suppliers_generic_material_id_generic_materials_id_fk";
ALTER TABLE "generic_material_suppliers"
        ADD CONSTRAINT "generic_material_suppliers_generic_material_id_generic_materials_id_fk"
        FOREIGN KEY ("generic_material_id") REFERENCES "public"."generic_materials"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "offers"
        DROP CONSTRAINT IF EXISTS "offers_rfq_id_rfqs_id_fk";
ALTER TABLE "offers"
        ADD CONSTRAINT "offers_rfq_id_rfqs_id_fk"
        FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "rfq_recipients"
        DROP CONSTRAINT IF EXISTS "rfq_recipients_rfq_id_rfqs_id_fk";
ALTER TABLE "rfq_recipients"
        ADD CONSTRAINT "rfq_recipients_rfq_id_rfqs_id_fk"
        FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "rfqs"
        DROP CONSTRAINT IF EXISTS "rfqs_generic_material_id_generic_materials_id_fk";
ALTER TABLE "rfqs"
        ADD CONSTRAINT "rfqs_generic_material_id_generic_materials_id_fk"
        FOREIGN KEY ("generic_material_id") REFERENCES "public"."generic_materials"("id") ON DELETE cascade ON UPDATE no action;
