ALTER TABLE "material_snapshots"
  DROP CONSTRAINT IF EXISTS "material_snapshots_run_section_revision_unique";
--> statement-breakpoint
ALTER TABLE "material_snapshots"
  ADD CONSTRAINT "material_snapshots_run_structure_section_revision_unique"
  UNIQUE("run_id", "structure_revision", "section_ref", "revision");
