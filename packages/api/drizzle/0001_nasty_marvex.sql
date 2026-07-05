ALTER TYPE "public"."claim_status" ADD VALUE 'submitting' BEFORE 'submitted';--> statement-breakpoint
ALTER TYPE "public"."batch_status" ADD VALUE 'failed';