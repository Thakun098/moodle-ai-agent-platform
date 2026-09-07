# Material-grounded activity authority

Status: Superseded in part by ADR-0002

The staged course-creation workflow assigns structure authority to the syllabus and activity-content authority to the teacher's sealed, section-scoped Learning Material Snapshot. This deliberate boundary preserves teacher control and reproducibility without changing the frozen CoursePlan contract or adding RAG.

ADR-0002 supersedes the former requirement that missing material blocks activity generation/finalization. Learning Material is now optional, activity existence requires explicit teacher authorization, and syllabus-grounded evidence is the deterministic fallback when a teacher-authorized activity has no Learning Material.
