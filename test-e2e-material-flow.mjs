const MOODLE_BASE_URL = "http://localhost:8000";
let sessionCookie = "";
let sesskey = "";

function createSimplePdf(text) {
  const stream = text.split("\n").map((line, index) =>
    `BT\n/F1 12 Tf\n72 ${720 - index * 18} Td\n(${line.replace(/[()\\]/g, "\\$&")}) Tj\nET\n`
  ).join("");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`, "latin1"));
  }
  const xrefOffset = Buffer.concat(chunks).length;
  const xref = ["xref\n0 6\n0000000000 65535 f \n"];
  for (let index = 1; index <= 5; index += 1) xref.push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  xref.push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  chunks.push(Buffer.from(xref.join(""), "latin1"));
  return Buffer.concat(chunks);
}

async function moodleFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (sessionCookie) headers.Cookie = sessionCookie;
  const response = await fetch(`${MOODLE_BASE_URL}${path}`, { ...options, headers, redirect: "manual" });
  const setCookie = response.headers.get("set-cookie");
  const match = setCookie?.match(/(MoodleSession=[^;]+)/);
  if (match) sessionCookie = match[1];
  return response;
}

async function login() {
  const page = await moodleFetch("/login/index.php");
  const html = await page.text();
  const token = html.match(/name="logintoken"\s+value="([^"]+)"/)?.[1];
  if (!token) throw new Error("Could not obtain Moodle login token");
  const body = new URLSearchParams({ username: "admin", password: "MoodleAgentPOC2026", logintoken: token });
  await moodleFetch("/login/index.php", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const createPage = await moodleFetch("/local/agentpoc/course/create.php");
  const createHtml = await createPage.text();
  sesskey = createHtml.match(/data-sesskey="([^"]+)"/)?.[1] || "";
  if (!sesskey) throw new Error("Could not obtain Moodle sesskey");
}

async function ajax(action, params = {}, multipart = false) {
  const query = `action=${encodeURIComponent(action)}&sesskey=${encodeURIComponent(sesskey)}`;
  const options = { method: "POST" };
  if (multipart) {
    options.body = params;
  } else {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) body.append(key, String(value));
    }
    options.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    options.body = body.toString();
  }
  const response = await moodleFetch(`/local/agentpoc/ajax.php?${query}`, options);
  const json = await response.json();
  if (!response.ok || !json.success) throw new Error(`${action} failed (${response.status}): ${JSON.stringify(json)}`);
  return json.data;
}

async function main() {
  console.log("[1] login");
  await login();

  const usePdf = process.env.E2E_PDF === "1";
  const syllabus = usePdf
    ? createSimplePdf(["Course: Algorithms", "Learning Objectives: Explain BFS", "Week 1: Breadth-first search", "Topics: graph traversal, queue, FIFO"].join("\n"))
    : `# วิชาอัลกอริทึมเบื้องต้น\n\n## Week 1: การค้นหาแบบ Breadth-First Search\n\nLearning Objectives:\n- อธิบายการทำงานของ BFS ได้\n- ระบุบทบาทของคิวใน BFS ได้\n\nTopics: graph traversal, queue, FIFO, breadth-first search.`;
  const upload = new FormData();
  upload.append("syllabus_file", new Blob([syllabus], { type: usePdf ? "application/pdf" : "text/markdown" }), usePdf ? "thai-syllabus.pdf" : "thai-syllabus.md");
  const run = await ajax("upload_and_create_run", upload, true);
  console.log("[2] run", run.run_id);

  const structureResult = await ajax("generate_structure", { run_id: run.run_id, teacher_instruction: "ทุกสัปดาห์สร้าง Quiz 1 ชุด" });
  const structure = structureResult.structure_revision;
  const section = structure.content.sections[0];
  if (!section) throw new Error("Structure has no section");
  if (!section.activity_intents.some((intent) => intent.origin === "teacher_instruction" && intent.ref)) throw new Error("Resolved teacher Quiz intent missing");
  console.log("[3] structure", structure.revision, section.ref, "intents=", section.activity_intents.length);

  await ajax("seal_structure", { run_id: run.run_id, revision: structure.revision });
  console.log("[4] structure sealed");

  const material = `# Week 1 Learning Material\n\nBreadth-first search visits vertices level by level. It uses a FIFO queue.\nThe queue stores discovered vertices until their adjacent vertices are processed.`;
  const materialUpload = new FormData();
  materialUpload.append("material_file", new Blob([material], { type: "text/markdown" }), "week-1-material.md");
  materialUpload.append("run_id", run.run_id);
  materialUpload.append("section_ref", section.ref);
  materialUpload.append("structure_revision", String(structure.revision));
  await ajax("upload_section_material", materialUpload, true);
  const snapshot = await ajax("seal_section_material", { run_id: run.run_id, section_ref: section.ref, structure_revision: structure.revision });
  console.log("[5] material snapshot", snapshot.snapshot?.revision || snapshot.revision);

  const generated = await ajax("generate_section_activities", { run_id: run.run_id, section_ref: section.ref });
  if (generated.state !== "GENERATED") throw new Error(`Expected GENERATED section, got ${generated.state}`);
  const activity = generated.activities?.[0];
  if (!activity || activity.type !== "quiz" || activity.source_refs?.[0]?.source !== "week-1-material.md") throw new Error("Generated activity is not material-grounded");
  console.log("[6] generated", activity.ref, activity.type, activity.source_refs[0].source);

  const planResult = await ajax("finalize_course_plan", { run_id: run.run_id });
  const plan = planResult.plan;
  console.log("[7] finalized", plan.planId, plan.revision, planResult.status);
  const preview = await ajax("get_preview", { plan_id: plan.planId, revision: plan.revision });
  if (preview.structure.sections[0].activities[0].source_refs[0].source !== "week-1-material.md") throw new Error("Final preview lost material provenance");
  await ajax("approve_plan", { run_id: run.run_id, plan_id: plan.planId, revision: plan.revision });
  const execution = await ajax("execute_run", { run_id: run.run_id, plan_id: plan.planId, revision: plan.revision, category_id: 1 });
  const verification = await ajax("verify_run", { run_id: run.run_id, plan_id: plan.planId, revision: plan.revision });
  console.log("[8] execute", execution.course_id, "verify=", verification.passed);
  if (!verification.passed) throw new Error(`Verification failed: ${JSON.stringify(verification)}`);
  console.log("MATERIAL_GROUNDED_E2E=PASS");
}

main().catch((error) => {
  console.error("MATERIAL_GROUNDED_E2E=FAIL", error);
  process.exitCode = 1;
});
