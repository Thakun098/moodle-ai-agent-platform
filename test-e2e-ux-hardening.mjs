const MOODLE_BASE_URL = "http://localhost:8000";
let sessionCookie = "";
let sesskey = "";

async function moodleFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (sessionCookie) headers.Cookie = sessionCookie;
  const response = await fetch(`${MOODLE_BASE_URL}${path}`, { ...options, headers, redirect: "manual" });
  const setCookie = response.headers.get("set-cookie");
  const match = setCookie?.match(/(MoodleSession=[^;]+)/u);
  if (match) sessionCookie = match[1];
  return response;
}

async function login() {
  const page = await moodleFetch("/login/index.php");
  const html = await page.text();
  const token = html.match(/name="logintoken"\s+value="([^"]+)"/u)?.[1];
  if (!token) throw new Error("Could not obtain Moodle login token");
  const body = new URLSearchParams({ username: "admin", password: "MoodleAgentPOC2026", logintoken: token });
  await moodleFetch("/login/index.php", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const createPage = await moodleFetch("/local/agentpoc/course/create.php");
  sesskey = (await createPage.text()).match(/data-sesskey="([^"]+)"/u)?.[1] || "";
  if (!sesskey) throw new Error("Could not obtain Moodle sesskey");
}

async function ajax(action, params = {}, multipart = false) {
  const query = `action=${encodeURIComponent(action)}&sesskey=${encodeURIComponent(sesskey)}`;
  const options = { method: "POST" };
  if (multipart) options.body = params;
  else {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) body.append(key, String(value));
    options.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    options.body = body.toString();
  }
  const response = await moodleFetch(`/local/agentpoc/ajax.php?${query}`, options);
  const json = await response.json();
  if (!response.ok || !json.success) throw new Error(`${action} failed (${response.status}): ${JSON.stringify(json)}`);
  return json.data;
}

async function uploadMaterial(runId, sectionRef, structureRevision, filename, text) {
  const upload = new FormData();
  upload.append("material_file", new Blob([text], { type: "text/markdown" }), filename);
  upload.append("run_id", runId);
  upload.append("section_ref", sectionRef);
  upload.append("structure_revision", String(structureRevision));
  await ajax("upload_section_material", upload, true);
  return ajax("seal_section_material", { run_id: runId, section_ref: sectionRef, structure_revision: structureRevision });
}

async function main() {
  await login();
  const syllabus = `# CS231 Object-Oriented Programming with C#\n\n## Course Description\nA representative C# OOP course covering classes, inheritance, and polymorphism.\n\n## Learning Objectives\n- Define classes and create objects in C#.\n- Explain inheritance and polymorphism.\n\n## Week 1: Classes and Encapsulation\n- Classes, objects, constructors, properties, and access modifiers.\n\n## Week 2: Inheritance and Polymorphism\n- Base classes, derived classes, virtual methods, and overriding.`;
  const syllabusUpload = new FormData();
  syllabusUpload.append("syllabus_file", new Blob([syllabus], { type: "text/markdown" }), "cs231-oop-syllabus.md");
  syllabusUpload.append("course_format", "tiles");
  const run = await ajax("upload_and_create_run", syllabusUpload, true);
  const structureResult = await ajax("generate_structure", { run_id: run.run_id });
  const structure = structureResult.structure_revision;
  const [week1, week2] = structure.content.sections;
  if (!week1 || !week2) throw new Error("Expected at least two syllabus sections");
  await ajax("seal_structure", { run_id: run.run_id, revision: structure.revision });

  const quizOptions = { question_count: 2, question_type: "multichoice", choices_per_question: 4 };
  const assignmentOptions = { grade: 100 };
  const week1Intents = await ajax("set_activity_intents", { run_id: run.run_id, section_ref: week1.ref, quiz: 1, assignment: 1, quiz_options: JSON.stringify(quizOptions), assignment_options: JSON.stringify(assignmentOptions) });
  const week2Intents = await ajax("set_activity_intents", { run_id: run.run_id, section_ref: week2.ref, quiz: 1, assignment: 0, quiz_options: JSON.stringify(quizOptions), assignment_options: JSON.stringify(assignmentOptions) });

  const week1Snapshot = await uploadMaterial(run.run_id, week1.ref, structure.revision, "CS231_Week_01_Material.md", "C# classes, objects, constructors, and encapsulation.");
  await uploadMaterial(run.run_id, week2.ref, structure.revision, "CS231_Week_02_Material-A.md", "C# inheritance material A.");
  const week2Snapshot = await uploadMaterial(run.run_id, week2.ref, structure.revision, "CS231_Week_02_Material-B.md", "C# inheritance material B and polymorphism.");
  if (week2Snapshot.snapshot?.revision !== 2) throw new Error("Replacement material did not create snapshot revision 2");
  await ajax("set_resource_publication", { run_id: run.run_id, section_ref: week2.ref, publish: 0 });

  const generated = [];
  for (const intent of [...(week1Intents.intents || []), ...(week2Intents.intents || [])]) {
    const result = await ajax("generate_activity", { run_id: run.run_id, section_ref: intent.section_ref, activity_ref: intent.activity_ref });
    if (result.status !== "generated") throw new Error(`Activity ${intent.activity_ref} was not generated: ${JSON.stringify(result)}`);
    generated.push(result);
  }
  const planResult = await ajax("finalize_course_plan", { run_id: run.run_id });
  const plan = planResult.plan;
  const preview = await ajax("get_preview", { plan_id: plan.planId, revision: plan.revision });
  const previewSections = preview.structure.sections;
  const previewWeek1 = previewSections.find((section) => section.ref === week1.ref);
  const previewWeek2 = previewSections.find((section) => section.ref === week2.ref);
  if (previewWeek1?.resources?.length !== 1 || previewWeek1.resources[0].filename !== "CS231_Week_01_Material.md") throw new Error("Kept Week 1 resource missing from Official Preview");
  if (previewWeek2?.resources?.length !== 0) throw new Error("Removed Week 2 resource remained in Official Preview");
  if (previewWeek1.activities.length !== 2 || previewWeek2.activities.length !== 1) throw new Error("Official Preview activity counts do not match selected activities");

  await ajax("approve_plan", { run_id: run.run_id, plan_id: plan.planId, revision: plan.revision });
  const execution = await ajax("execute_run", { run_id: run.run_id, plan_id: plan.planId, revision: plan.revision, category_id: 1 });
  const verification = await ajax("verify_run", { run_id: run.run_id, plan_id: plan.planId, revision: plan.revision });
  if (!verification.passed) throw new Error(`Verification failed: ${JSON.stringify(verification)}`);
  const observed = await ajax("get_course_structure", { course_id: execution.course_id });
  if (observed.course.format !== "tiles") throw new Error(`Expected tiles, got ${observed.course.format}`);
  const observedWeek1 = observed.sections.find((section) => section.section_num === week1.position);
  const observedWeek2 = observed.sections.find((section) => section.section_num === week2.position);
  const kept = (observedWeek1?.activities || []).filter((activity) => activity.modulename === "resource" && activity.files?.includes("CS231_Week_01_Material.md"));
  const removed = (observedWeek2?.activities || []).filter((activity) => activity.modulename === "resource");
  if (kept.length !== 1) throw new Error(`Expected exactly one kept resource, got ${kept.length}`);
  if (removed.length !== 0) throw new Error(`Expected no removed-week resources, got ${removed.length}`);
  console.log(JSON.stringify({ run_id: run.run_id, plan_id: plan.planId, revision: plan.revision, moodle_course_id: execution.course_id, execution_status: execution.status, verification_passed: verification.passed, format: observed.course.format, kept_resources: kept.length, removed_week_resources: removed.length, generated_activities: generated.length }));
}

main().catch((error) => { console.error("UX_HARDENING_E2E=FAIL", error); process.exitCode = 1; });
