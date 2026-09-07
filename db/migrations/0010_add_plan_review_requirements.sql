ALTER TABLE "poc_plan"
ADD COLUMN IF NOT EXISTS "review_requirements" jsonb NOT NULL DEFAULT '[]'::jsonb;
