ALTER TABLE "section_activity_drafts"
  ADD COLUMN IF NOT EXISTS "generation_instruction" text;
