CREATE TYPE "public"."subscription_status" AS ENUM('free', 'active');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('inbound', 'outbound', 'system');--> statement-breakpoint
CREATE TYPE "public"."timeline_entry_type" AS ENUM('message', 'widget', 'system_event');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('default', 'filtered', 'internal');--> statement-breakpoint
CREATE TYPE "public"."widget_type" AS ENUM('claim_confirmation', 'claim_update_confirmation', 'action_card', 'report');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('pending_confirmation', 'staged', 'submitting', 'submitted', 'accepted', 'rejected', 'needs_attention', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('pending', 'submitted', 'completed', 'partial_failure', 'failed');--> statement-breakpoint
CREATE TYPE "public"."diagnostic_code_system" AS ENUM('icd9', 'icd10');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255),
	"phone" varchar(20) NOT NULL,
	"email" varchar(255),
	"billing_preferences" jsonb,
	"ahcip_practitioner_id" varchar(20),
	"subscription_status" "subscription_status" DEFAULT 'free' NOT NULL,
	"push_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "timeline_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" timeline_entry_type NOT NULL,
	"direction" "direction" NOT NULL,
	"content" text,
	"widget_type" "widget_type",
	"widget_data" jsonb,
	"visibility" "visibility" DEFAULT 'default' NOT NULL,
	"importance_flag" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"timeline_entry_id" uuid,
	"status" "claim_status" DEFAULT 'pending_confirmation' NOT NULL,
	"fee_code" varchar(20) NOT NULL,
	"modifier" varchar(10),
	"phn" text NOT NULL,
	"phn_last4" varchar(4) NOT NULL,
	"patient_name" varchar(255),
	"service_date" date NOT NULL,
	"diagnostic_code" varchar(20),
	"expected_fee" numeric(10, 2) NOT NULL,
	"rejection_reason" text,
	"submitted_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "batch_status" DEFAULT 'pending' NOT NULL,
	"claim_ids" uuid[] NOT NULL,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"response_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "fee_codes" (
	"code" varchar(20) NOT NULL,
	"description" text NOT NULL,
	"base_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"modifiers" jsonb,
	"category" varchar(50) NOT NULL,
	"rules_notes" text,
	"effective_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "fee_codes_code_effective_date_pk" PRIMARY KEY("code","effective_date")
);
--> statement-breakpoint
CREATE TABLE "diagnostic_codes" (
	"code" varchar(20) NOT NULL,
	"code_system" "diagnostic_code_system" NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"category" varchar(100),
	"effective_date" date NOT NULL,
	"end_date" date,
	CONSTRAINT "diagnostic_codes_code_code_system_pk" PRIMARY KEY("code","code_system")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(50) NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" varchar(255),
	"metadata" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_timeline_entry_id_timeline_entries_id_fk" FOREIGN KEY ("timeline_entry_id") REFERENCES "public"."timeline_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "timeline_user_created_idx" ON "timeline_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "claims_user_status_idx" ON "claims" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "diagnostic_codes_enabled_idx" ON "diagnostic_codes" USING btree ("code_system","enabled");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_codes" USING btree ("phone");