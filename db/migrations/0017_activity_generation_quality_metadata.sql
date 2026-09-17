ALTER TABLE "poc_activity_intent"
  ADD COLUMN "quality_review_json" jsonb,
  ADD COLUMN "generation_metadata_json" jsonb;
