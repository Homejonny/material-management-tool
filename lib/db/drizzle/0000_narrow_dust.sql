CREATE TABLE "vendor_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_name" text NOT NULL,
	"vendor_no" text DEFAULT '' NOT NULL,
	"item_no" text NOT NULL,
	"item_description" text DEFAULT '' NOT NULL,
	"price" numeric(12, 4),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"quantity" numeric(12, 4),
	"uom" text DEFAULT '' NOT NULL,
	"delivery_days" integer,
	"valid_until" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"source_file" text DEFAULT '' NOT NULL,
	"raw_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generic_material_suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"generic_material_id" serial NOT NULL,
	"vendor_no" text DEFAULT '' NOT NULL,
	"vendor_name" text NOT NULL,
	"vendor_email" text DEFAULT '' NOT NULL,
	"vendor_country" text DEFAULT '' NOT NULL,
	"vendor_item_no" text DEFAULT '' NOT NULL,
	"vendor_item_name" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generic_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"generic_code" text NOT NULL,
	"name" text NOT NULL,
	"uom" text DEFAULT 'KG' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generic_materials_generic_code_unique" UNIQUE("generic_code")
);
--> statement-breakpoint
CREATE TABLE "offers" (
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
--> statement-breakpoint
CREATE TABLE "rfq_recipients" (
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
--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" serial PRIMARY KEY NOT NULL,
	"generic_material_id" integer NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"uom" text DEFAULT 'KG' NOT NULL,
	"requested_date" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generic_material_suppliers" ADD CONSTRAINT "generic_material_suppliers_generic_material_id_generic_materials_id_fk" FOREIGN KEY ("generic_material_id") REFERENCES "public"."generic_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_recipients" ADD CONSTRAINT "rfq_recipients_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_generic_material_id_generic_materials_id_fk" FOREIGN KEY ("generic_material_id") REFERENCES "public"."generic_materials"("id") ON DELETE cascade ON UPDATE no action;