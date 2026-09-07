import { readFileSync } from "node:fs";

const MOODLE_BASE_URL = "http://localhost:8000";
let sessionCookie = "";
let sesskey = "";

console.log("=== Moodle Agent POC: Full E2E Course Builder Flow Test ===");

async function moodleFetch(path, options = {}) {
  const headers = options.headers || {};
  if (sessionCookie) {
    headers["Cookie"] = sessionCookie;
  }
  const res = await fetch(`${MOODLE_BASE_URL}${path}`, {
    ...options,
    headers,
    redirect: "manual",
  });

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/(MoodleSession=[^;]+)/);
    if (match) {
      sessionCookie = match[1];
    }
  }
  return res;
}

async function loginAsAdmin() {
  console.log("\n[1/7] Logging into Moodle as admin...");
  // Step A: get login token from login page
  const loginPageRes = await moodleFetch("/login/index.php");
  const html = await loginPageRes.text();
  const tokenMatch = html.match(/name="logintoken"\s+value="([^"]+)"/);
  if (!tokenMatch) {
    throw new Error("Failed to extract logintoken from login page");
  }
  const logintoken = tokenMatch[1];

  // Step B: POST credentials
  const params = new URLSearchParams();
  params.append("username", "admin");
  params.append("password", "MoodleAgentPOC2026");
  params.append("logintoken", logintoken);

  const loginRes = await moodleFetch("/login/index.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  console.log("Login HTTP status:", loginRes.status);
  console.log("Session cookie:", sessionCookie);

  // Step C: GET create page to extract sesskey
  const createPageRes = await moodleFetch("/local/agentpoc/course/create.php");
  const createHtml = await createPageRes.text();
  const sesskeyMatch = createHtml.match(/data-sesskey="([^"]+)"/);
  if (!sesskeyMatch) {
    throw new Error("Failed to extract sesskey from course/create.php: User may not have logged in properly or lacks capability.");
  }
  sesskey = sesskeyMatch[1];
  console.log("Sesskey successfully obtained:", sesskey);
}

async function main() {
  await loginAsAdmin();

  const sampleSyllabus = JSON.parse(
    readFileSync(new URL("./scratch-oop-syllabus.json", import.meta.url), "utf16le").replace(/^\uFEFF/, "").trim()
  ).raw_text;

  console.log("\n[2/7] Calling Moodle BFF: upload_and_create_run...");
  const formData = new FormData();
  const blob = new Blob([sampleSyllabus], { type: "text/markdown" });
  formData.append("syllabus_file", blob, "syllabus.md");

  const uploadRes = await moodleFetch(`/local/agentpoc/ajax.php?action=upload_and_create_run&sesskey=${sesskey}`, {
    method: "POST",
    body: formData,
  });

  const uploadData = await uploadRes.json();
  console.log("Upload result:", JSON.stringify(uploadData, null, 2));
  if (!uploadData.success) throw new Error("Upload failed: " + JSON.stringify(uploadData));

  const runId = uploadData.data.run_id;
  console.log("Created Run ID:", runId);

  console.log("\n[3/7] Calling Moodle BFF: generate_plan with Groq LLM (openai/gpt-oss-120b)...");
  const genPlanRes = await moodleFetch(`/local/agentpoc/ajax.php?action=generate_plan&run_id=${runId}&sesskey=${sesskey}`, {
    method: "POST",
  });
  const genPlanData = await genPlanRes.json();
  if (!genPlanData.success) throw new Error("Plan generation failed: " + JSON.stringify(genPlanData));

  const plan = genPlanData.data.plan;
  const preview = genPlanData.data.preview;
  console.log(`Plan generated! Plan ID: ${plan.planId}, Revision: ${plan.revision}`);
  console.log("Plan title:", preview.title);
  console.log("Sections count:", preview.structure?.sections?.length || 0);

  console.log("\n[4/7] Calling Moodle BFF: save_revision (editing title -> Revision 2)...");
  const editedEnvelope = JSON.parse(JSON.stringify(plan.rawEnvelope));
  editedEnvelope.title = "Introduction to Python & Data Science (Teacher Revised)";
  editedEnvelope.content.course.title = "Introduction to Python & Data Science (Teacher Revised)";

  const revisionParams = new URLSearchParams();
  revisionParams.append("envelope", JSON.stringify(editedEnvelope));
  revisionParams.append("summary", "Teacher revised title");
  const revRes = await moodleFetch(`/local/agentpoc/ajax.php?action=save_revision&plan_id=${plan.planId}&sesskey=${sesskey}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: revisionParams.toString(),
  });
  const revData = await revRes.json();
  if (!revData.success) throw new Error("Save revision failed: " + JSON.stringify(revData));
  console.log(`New Revision created! Revision: ${revData.data.plan.revision}`);

  console.log("\n[5/7] Testing Approval Gate: Attempting to execute unapproved Revision 2...");
  const unapprovedExecRes = await moodleFetch(`/local/agentpoc/ajax.php?action=execute_run&run_id=${runId}&plan_id=${plan.planId}&revision=2&category_id=1&sesskey=${sesskey}`, {
    method: "POST",
  });
  const unapprovedJson = await unapprovedExecRes.json();
  console.log("Unapproved execution rejection response:", JSON.stringify(unapprovedJson, null, 2));
  if (unapprovedExecRes.status === 200 && unapprovedJson.success) {
    throw new Error("SECURITY FAILURE: Unapproved Revision 2 was executed!");
  }
  console.log("Approval Gate correctly rejected unapproved Revision 2 execution!");

  console.log("\n[6/7] Approving Revision 2 via Moodle BFF (approver: admin user 2)...");
  const approveRes = await moodleFetch(`/local/agentpoc/ajax.php?action=approve_plan&run_id=${runId}&plan_id=${plan.planId}&revision=2&sesskey=${sesskey}`, {
    method: "POST",
  });
  const approveData = await approveRes.json();
  console.log("Approval result:", JSON.stringify(approveData, null, 2));
  if (!approveData.success) throw new Error("Approval failed: " + JSON.stringify(approveData));
  if (approveData.data.approved_by_moodle_user_id !== "2") {
    throw new Error("Expected approver user ID 2, got: " + approveData.data.approved_by_moodle_user_id);
  }
  console.log("Revision 2 successfully approved with Moodle user ID 2!");

  console.log("\n[7/7] Executing approved Revision 2 and verifying course creation...");
  const execRes = await moodleFetch(`/local/agentpoc/ajax.php?action=execute_run&run_id=${runId}&plan_id=${plan.planId}&revision=2&category_id=1&sesskey=${sesskey}`, {
    method: "POST",
  });
  const execData = await execRes.json();
  console.log("Execution result:", JSON.stringify(execData, null, 2));
  if (!execData.success) throw new Error("Execution failed: " + JSON.stringify(execData));

  const courseId = execData.data.course_id;
  console.log(`Course created in Moodle! Course ID: ${courseId}`);

  console.log("Verifying course via Moodle BFF verify_run...");
  const verifyRes = await moodleFetch(`/local/agentpoc/ajax.php?action=verify_run&run_id=${runId}&plan_id=${plan.planId}&revision=2&sesskey=${sesskey}`, {
    method: "POST",
  });
  const verifyData = await verifyRes.json();
  console.log("Verification result:", JSON.stringify(verifyData, null, 2));
  if (!verifyData.success) throw new Error("Verification failed: " + JSON.stringify(verifyData));

  console.log("\n=======================================================");
  console.log("?? SUCCESS! FULL E2E COURSE BUILDER WORKFLOW VERIFIED!");
  console.log(`Course ID: ${courseId}`);
  console.log(`Course URL: ${MOODLE_BASE_URL}/course/view.php?id=${courseId}`);
  console.log("=======================================================");
}

main().catch((err) => {
  console.error("FATAL ERROR IN E2E FLOW:", err);
  process.exit(1);
});
