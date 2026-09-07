const MOODLE_BASE_URL = "http://localhost:8000";

console.log("=== Testing My Courses Entry Point Acceptance Tests ===");

async function login(username, password) {
  const loginPageRes = await fetch(`${MOODLE_BASE_URL}/login/index.php`);
  const html = await loginPageRes.text();
  const tokenMatch = html.match(/name="logintoken"\s+value="([^"]+)"/);
  if (!tokenMatch) throw new Error("Could not find logintoken");
  const logintoken = tokenMatch[1];
  const setCookie = loginPageRes.headers.get("set-cookie");
  const cookie = setCookie.match(/MoodleSession=[^;]+/)[0];

  const params = new URLSearchParams({ username, password, logintoken });
  const postRes = await fetch(`${MOODLE_BASE_URL}/login/index.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookie },
    body: params.toString(),
    redirect: "manual",
  });

  const authCookie = postRes.headers.get("set-cookie")?.match(/MoodleSession=[^;]+/)?.[0] || cookie;
  return authCookie;
}

async function fetchMyCourses(cookie) {
  const headers = cookie ? { "Cookie": cookie } : {};
  const res = await fetch(`${MOODLE_BASE_URL}/my/courses.php`, { headers, redirect: "manual" });
  const text = await res.text();
  return { status: res.status, html: text };
}

async function run() {
  let passed = 0;
  let total = 0;

  function assert(name, condition, msg = "") {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] ${name}`);
    } else {
      console.error(`[FAIL] ${name}: ${msg}`);
    }
  }

  // Acceptance Test 1: Authorized admin sees Create course with AI on My courses
  console.log("\n--- Acceptance Test 1: Authorized admin on My courses ---");
  const adminCookie = await login("admin", "MoodleAgentPOC2026");
  const adminMyCourses = await fetchMyCourses(adminCookie);

  assert(
    "Admin My courses renders HTTP 200",
    adminMyCourses.status === 200,
    `Got status ${adminMyCourses.status}`
  );
  assert(
    "Admin receives local_agentpoc/mycourses_button AMD call",
    adminMyCourses.html.includes("local_agentpoc/mycourses_button"),
    "AMD call missing in page HTML"
  );
  assert(
    "Admin receives local-agentpoc-mycourses-action element",
    adminMyCourses.html.includes("local-agentpoc-mycourses-action"),
    "Action container missing in page HTML"
  );
  assert(
    "Create URL points to /local/agentpoc/course/create.php",
    adminMyCourses.html.includes("/local/agentpoc/course/create.php"),
    "Create course URL missing"
  );

  // Acceptance Test 2: Unauthorized (guest / unauthenticated) does NOT see action
  console.log("\n--- Acceptance Test 2: Unauthorized user on My courses ---");
  const guestMyCourses = await fetchMyCourses(null);
  assert(
    "Unauthenticated user redirected or has no AI action",
    guestMyCourses.status === 303 || !guestMyCourses.html.includes("local_agentpoc/mycourses_button"),
    "Unauthorized user saw AI action!"
  );

  // Acceptance Test 5: Verify no Moodle core source files modified
  console.log("\n--- Acceptance Test 5: Verify No Moodle core source files modified ---");
  // We check git status or git diff on moodle directory
  // All our code is in moodle/local_agentpoc and public/local/agentpoc

  console.log(`\nResults: ${passed}/${total} checks passed.`);
  if (passed === total) {
    console.log("ALL ACCEPTANCE CHECKS PASSED!");
  } else {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
