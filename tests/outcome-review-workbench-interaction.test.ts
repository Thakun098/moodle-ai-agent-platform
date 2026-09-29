import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

class FakeElement {
  tag: string;
  id: string | null = null;
  classes = new Set<string>();
  attrs = new Map<string, unknown>();
  props = new Map<string, unknown>();
  value: unknown = "";
  textValue = "";
  htmlValue = "";
  children: Array<FakeElement | string> = [];
  handlers = new Map<string, Array<(event?: any) => any>>();

  constructor(tag = "div") {
    this.tag = tag.toLowerCase();
  }

  allText(): string {
    return [this.textValue, ...this.children.map((child) => typeof child === "string" ? child : child.allText())].join(" ").replace(/\s+/g, " ").trim();
  }
}

class FakeSelection {
  constructor(private readonly env: FakeDom, readonly elements: FakeElement[]) {}
  get length() { return this.elements.length; }
  first() { return new FakeSelection(this.env, this.elements.slice(0, 1)); }
  on(events: string, handler: (event?: any) => any) {
    for (const eventName of events.split(/\s+/).filter(Boolean)) {
      for (const element of this.elements) {
        const list = element.handlers.get(eventName) ?? [];
        list.push(handler);
        element.handlers.set(eventName, list);
      }
    }
    return this;
  }
  off(events?: string) {
    for (const element of this.elements) {
      if (!events) element.handlers.clear();
      else for (const eventName of events.split(/\s+/).filter(Boolean)) {
        if (eventName.startsWith(".")) {
          for (const key of [...element.handlers.keys()]) if (key.includes(eventName)) element.handlers.delete(key);
        } else {
          element.handlers.delete(eventName);
        }
      }
    }
    return this;
  }
  trigger(eventName: string) {
    for (const element of this.elements) {
      if (eventName === "focus") this.env.focused = element;
      const base = eventName.split(".")[0];
      for (const [registered, handlers] of element.handlers.entries()) {
        if (registered.split(".")[0] !== base) continue;
        for (const handler of handlers) handler.call(element, { preventDefault() {}, stopPropagation() {}, target: element });
      }
    }
    return this;
  }
  val(value?: unknown): any {
    if (arguments.length) { for (const element of this.elements) element.value = value; return this; }
    return this.elements[0]?.value;
  }
  text(value?: unknown): any {
    if (arguments.length) { for (const element of this.elements) element.textValue = String(value ?? ""); return this; }
    return this.elements[0]?.allText() ?? "";
  }
  html(value?: unknown): any {
    if (arguments.length) { for (const element of this.elements) { for (const child of element.children) if (child instanceof FakeElement) this.env.removeTree(child); element.htmlValue = String(value ?? ""); element.children = []; } return this; }
    return this.elements[0]?.htmlValue ?? "";
  }
  empty() { for (const element of this.elements) { for (const child of element.children) if (child instanceof FakeElement) this.env.removeTree(child); element.children = []; element.textValue = ""; element.htmlValue = ""; } return this; }
  append(...values: any[]) {
    for (const element of this.elements) {
      for (const value of values) {
        if (value instanceof FakeSelection) {
          for (const child of value.elements) { this.env.restoreTree(child); element.children.push(child); }
        }
        else if (value instanceof FakeElement) { this.env.restoreTree(value); element.children.push(value); }
        else if (value && typeof value === "object" && "textContent" in value) element.children.push(String(value.textContent));
        else if (value !== undefined && value !== null) element.children.push(String(value));
      }
    }
    return this;
  }
  prepend(...values: any[]) {
    for (const element of this.elements) {
      const next: Array<FakeElement | string> = [];
      for (const value of values) {
        if (value instanceof FakeSelection) {
          for (const child of value.elements) { this.env.restoreTree(child); next.push(child); }
        }
        else if (value instanceof FakeElement) { this.env.restoreTree(value); next.push(value); }
        else if (value !== undefined && value !== null) next.push(String(value));
      }
      element.children.unshift(...next);
    }
    return this;
  }
  remove() {
    for (const element of this.elements) this.env.removeTree(element);
    return this;
  }
  addClass(value: string) { for (const element of this.elements) for (const name of String(value).split(/\s+/).filter(Boolean)) element.classes.add(name); return this; }
  removeClass(value: string) { for (const element of this.elements) for (const name of String(value).split(/\s+/).filter(Boolean)) element.classes.delete(name); return this; }
  toggleClass(value: string, force?: boolean) {
    for (const element of this.elements) for (const name of String(value).split(/\s+/).filter(Boolean)) {
      const next = force === undefined ? !element.classes.has(name) : force;
      if (next) element.classes.add(name); else element.classes.delete(name);
    }
    return this;
  }
  prop(name: string, value?: unknown): any {
    if (arguments.length > 1) { for (const element of this.elements) element.props.set(name, value); return this; }
    return this.elements[0]?.props.get(name);
  }
  attr(name: string, value?: unknown): any {
    if (arguments.length > 1) {
      for (const element of this.elements) {
        if (value === null || value === undefined) element.attrs.delete(name);
        else element.attrs.set(name, value);
        if (name === "id") this.env.setId(element, String(value));
      }
      return this;
    }
    return this.elements[0]?.attrs.get(name);
  }
  find(selector: string) { return this.env.query(selector, this.elements); }
  each(handler: (index: number, element: FakeElement) => void) { this.elements.forEach((element, index) => handler(index, element)); return this; }
  is(selector: string) {
    const element = this.elements[0];
    if (!element) return false;
    if (selector === ":checked") return element.props.get("checked") === true;
    return false;
  }
  modal(action?: any) {
    if (action === "hide") {
      setTimeout(() => {
        for (const element of this.elements) {
          for (const handler of element.handlers.get("hidden.bs.modal") ?? []) handler({ target: element });
        }
      }, 0);
    }
    return this;
  }
  animate() { return this; }
  offset() { return { top: 0 }; }
  scrollTop(value?: number): any {
    if (arguments.length) { for (const element of this.elements) element.props.set("scrollTop", Number(value ?? 0)); return this; }
    return Number(this.elements[0]?.props.get("scrollTop") ?? 0);
  }
}

class FakeDom {
  all = new Set<FakeElement>();
  byId = new Map<string, FakeElement>();
  focused: FakeElement | null = null;

  create(tag = "div") { const element = new FakeElement(tag); this.all.add(element); return element; }
  setId(element: FakeElement, id: string) { element.id = id; element.attrs.set("id", id); this.byId.set(id, element); }
  removeTree(element: FakeElement) { for (const child of element.children) if (child instanceof FakeElement) this.removeTree(child); if (element.id && this.byId.get(element.id) === element) this.byId.delete(element.id); this.all.delete(element); }
  restoreTree(element: FakeElement) { this.all.add(element); if (element.id) this.byId.set(element.id, element); for (const child of element.children) if (child instanceof FakeElement) this.restoreTree(child); }
  mount(id: string, tag = "div") { const element = this.create(tag); this.setId(element, id); return element; }

  fromHtml(html: string) {
    const tag = html.match(/^<\s*([a-z0-9-]+)/i)?.[1] ?? "div";
    const element = this.create(tag);
    const id = html.match(/\bid=["']([^"']+)["']/i)?.[1];
    if (id) this.setId(element, id);
    const classValue = html.match(/\bclass=["']([^"']*)["']/i)?.[1];
    if (classValue) for (const name of classValue.split(/\s+/).filter(Boolean)) element.classes.add(name);
    const value = html.match(/\bvalue=["']([^"']*)["']/i)?.[1];
    if (value !== undefined) element.value = value;
    const disabled = /\bdisabled\b/i.test(html);
    if (disabled) element.props.set("disabled", true);
    const innerText = html.replace(/^<[^>]+>/, "").replace(/<\/[^>]+>\s*$/, "").replace(/<[^>]+>/g, "").trim();
    if (innerText) element.textValue = innerText;
    return new FakeSelection(this, [element]);
  }

  descendants(roots: FakeElement[]): FakeElement[] {
    const out: FakeElement[] = [];
    const visit = (element: FakeElement) => {
      for (const child of element.children) if (child instanceof FakeElement) { out.push(child); visit(child); }
    };
    roots.forEach(visit);
    return out;
  }

  query(selector: string, roots?: FakeElement[]) {
    if (selector.startsWith("<")) return this.fromHtml(selector);
    const parts = selector.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) {
      const seen = new Set<FakeElement>();
      const items: FakeElement[] = [];
      for (const part of parts) {
        for (const element of this.query(part, roots).elements) {
          if (!seen.has(element)) { seen.add(element); items.push(element); }
        }
      }
      return new FakeSelection(this, items);
    }

    const disabledFilter = selector.includes(":not(:disabled)");
    const clean = selector.replace(/:not\(:disabled\)/g, "").trim();
    const descendant = clean.match(/^(#[A-Za-z0-9_-]+)\s+(.+)$/);
    if (descendant) {
      const root = this.byId.get(descendant[1]!.slice(1));
      return root ? this.query(descendant[2]!, [root]) : new FakeSelection(this, []);
    }

    const pool = roots ? this.descendants(roots) : [...this.all];
    let matched: FakeElement[] = [];
    if (/^#[A-Za-z0-9_-]+$/.test(clean)) {
      const element = this.byId.get(clean.slice(1));
      matched = element ? [element] : [];
    } else if (/^\.[A-Za-z0-9_-]+$/.test(clean)) {
      matched = pool.filter((element) => element.classes.has(clean.slice(1)));
    } else if (/^[A-Za-z0-9_-]+$/.test(clean)) {
      matched = pool.filter((element) => element.tag === clean.toLowerCase());
    } else if (/^\[data-dismiss=["']modal["']\]$/.test(clean)) {
      matched = pool.filter((element) => element.attrs.get("data-dismiss") === "modal");
    } else if (/^option\[data-outside-section=["']1["']\]$/.test(clean)) {
      matched = pool.filter((element) => element.tag === "option" && element.attrs.get("data-outside-section") === "1");
    } else {
      const dataRecovery = clean.match(/^\[data-recovery-key=["'](.+)["']\]$/);
      if (dataRecovery) matched = pool.filter((element) => element.attrs.get("data-recovery-key") === dataRecovery[1]);
    }
    if (disabledFilter) matched = matched.filter((element) => element.props.get("disabled") !== true);
    return new FakeSelection(this, matched);
  }

  byText(text: string, tag?: string) {
    return [...this.all].filter((element) => (!tag || element.tag === tag) && element.allText().includes(text));
  }
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function harness(options: { approvedClo?: boolean; reviewedLo?: boolean; confirmResult?: boolean; weekCount?: number; weekTitles?: string[]; weekStatuses?: string[]; selectedWeekRef?: string; selectedActivityWeekRef?: string; activityIntents?: any[]; deferActivityLoads?: boolean; localStorageSeed?: Record<string, string>; localStorageWriteFails?: boolean; materialSnapshot?: any; materialStatus?: any; failActions?: string[]; deferIntentSaves?: boolean; competencyCandidates?: any[]; deferCandidateDecisions?: boolean; candidateDecisionConflict?: boolean } = {}) {
  const harnessOptions = options;
  const source = readFileSync("moodle/local_agentpoc/amd/src/course_builder.js", "utf8");
  const dom = new FakeDom();
  for (const [id, tag] of [
    ["outcome-review-workbench", "div"], ["core-course-design-context", "section"], ["instructional-design-review", "div"],
    ["preview-course-title", "div"], ["preview-course-summary", "div"],
    ["preview-sections-container", "div"], ["preview-warnings-list", "ul"], ["btn-review-continue", "button"],
    ["btn-review-back", "button"], ["btn-review-regenerate", "button"], ["btn-edit-course-title", "button"],
    ["course-category-select", "select"], ["course-format-select", "select"], ["step-view-review", "div"], ["step-view-upload", "div"],
    ["step-view-activities", "div"], ["activity-structure-container", "div"], ["activity-summary-selected", "div"],
    ["activity-summary-ready", "div"], ["activity-summary-remaining", "div"], ["activity-footer-status", "div"],
    ["btn-activity-finalize", "button"], ["btn-activity-back", "button"],
    ["modal-edit-title", "div"], ["input-edit-course-title", "input"], ["input-edit-course-summary", "textarea"], ["btn-save-course-title", "button"],
    ["modal-edit-section", "div"], ["input-edit-section-index", "input"], ["input-edit-section-title", "input"],
    ["input-edit-section-summary", "textarea"], ["input-edit-section-objectives", "select"], ["input-edit-section-outcomes", "select"],
    ["btn-save-section", "button"],
    ["builder-error-alert", "div"], ["builder-error-message", "div"], ["builder-error-details", "div"],
  ] as const) dom.mount(id, tag);
  dom.byId.get("builder-error-details")!.children.push(dom.create("pre"));
  dom.byId.get("modal-edit-title")!.children.push(dom.byId.get("input-edit-course-title")!, dom.byId.get("input-edit-course-summary")!);
  dom.byId.get("modal-edit-section")!.children.push(
    dom.byId.get("input-edit-section-index")!, dom.byId.get("input-edit-section-title")!,
    dom.byId.get("input-edit-section-summary")!, dom.byId.get("input-edit-section-objectives")!, dom.byId.get("input-edit-section-outcomes")!
  );

  const calls: Array<{ action: string; body: URLSearchParams }> = [];
  const localStorageData = new Map<string, string>(Object.entries(options.localStorageSeed ?? {}));
  const localStorage = {
    getItem(key: string) { return localStorageData.has(key) ? localStorageData.get(key)! : null; },
    setItem(key: string, value: string) { if (options.localStorageWriteFails) throw new Error("quota exceeded"); localStorageData.set(key, String(value)); },
    removeItem(key: string) { localStorageData.delete(key); },
  };
  const windowEvents = new Map<string, Array<(event: any) => void>>();
  const confirmCalls: string[] = [];
  const coreContext = {
    revision: 1,
    learning_objectives: [{ objective_id: "objective-1", source_text: "Explain loops", source_refs: [{ start_line: 4, end_line: 4, text: "Explain loops" }] }],
    source_learning_outcomes: [{ source_outcome_id: "source-outcome-1", source_text: "Use loops", source_refs: [{ start_line: 5, end_line: 5, text: "Use loops" }] }],
    approved_learning_outcomes: options.approvedClo ? [{ outcome_id: "outcome-1", text: "Use loops carefully", source_outcome_ids: ["source-outcome-1"], source_refs: [{ start_line: 5, end_line: 5, text: "Use loops" }], approval_origin: "TEACHER_EDITED", approved_by_teacher: true, revision: 1 }] : [],
    learner_context: { status: "UNSPECIFIED" },
  };
  const reviewItems = [
    { item_type: "LO", item_id: "objective-1", status: options.reviewedLo ? "REVIEWED" : "PENDING_REVIEW", source_text: "Explain loops", authoritative_text: "Explain loops", draft_text: null, source_refs: coreContext.learning_objectives[0].source_refs },
    { item_type: "CLO", item_id: "source-outcome-1", status: options.approvedClo ? "APPROVED" : "REVIEWED", source_text: "Use loops", authoritative_text: options.approvedClo ? "Use loops carefully" : "Use loops", draft_text: "Use loops carefully", approved_outcome_id: options.approvedClo ? "outcome-1" : null, source_refs: coreContext.source_learning_outcomes[0].source_refs },
  ];
  let structureStale = false;
  const weekCount = options.weekCount ?? 1;
  const weeks = Array.from({ length: weekCount }, (_, index) => ({ ref: `section-0${index + 1}`, position: index + 1, title: options.weekTitles?.[index] ?? `Week ${index + 1}`,
    summary: `Topic ${index + 1}`, aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"], alignment_status: "CURRENT" }));
  const weekReviews = weeks.map((week, index) => ({ section_ref: week.ref, status: options.weekStatuses?.[index] ?? "Pending review", reviewed_at: null }));
  const structure = () => ({ revision: 1, title: "Course", summary: "Summary", sealed_at: "2026-09-19T00:00:00Z", content: { course: { title: "Course" }, sections: weeks.map((week) => ({ ...week, alignment_status: structureStale ? "STALE_ALIGNMENT" : "CURRENT" })) },
    teacher_constraints: structureStale ? { alignment_state: "STALE_ALIGNMENT" } : {}, week_reviews: weekReviews });
  const activityIntents = options.activityIntents ?? [];
  const competencyCandidates = options.competencyCandidates ?? [];
  const activityLoadResolvers: Array<() => void> = [];
  const intentSaveResolvers: Array<() => void> = [];
  const candidateDecisionResolvers: Array<() => void> = [];

  const fakeFetch = async (url: string, options: any) => {
    const action = new URL(url, "http://localhost").searchParams.get("action") ?? "";
    const body = new URLSearchParams(options?.body ?? "");
    calls.push({ action, body });
    if (action === "decide_competency_candidate" && harnessOptions.candidateDecisionConflict) {
      return { ok: false, json: async () => ({ success: false, error: { message: "stale Candidate", code: "COMPETENCY_CANDIDATE_REVISION_CONFLICT" } }) };
    }
    if ((harnessOptions.failActions ?? []).includes(action)) {
      return { ok: false, json: async () => ({ success: false, error: { message: action + " failed", code: "TEST_FAILURE" } }) };
    }
    let data: any = {};
    if (action === "get_instructional_design") data = { core_context: coreContext, outcome_proposals: [], competency_candidates: [], coverage: [], structure_revision: structure() };
    else if (action === "get_competency_candidates") data = { candidates: competencyCandidates };
    else if (action === "decide_competency_candidate") {
      if (harnessOptions.deferCandidateDecisions) await new Promise<void>((resolve) => candidateDecisionResolvers.push(resolve));
      const candidate = competencyCandidates.find((item) => item.candidate_id === body.get("candidate_id"));
      const decision = JSON.parse(String(body.get("decision") || "{}"));
      if (candidate) {
        candidate.revision = Number(candidate.revision || 0) + 1;
        candidate.status = decision.action === "approve" ? "APPROVED" : decision.action === "reject" ? "REJECTED" : decision.action === "defer" ? "DEFERRED" : "PROPOSED";
      }
      data = { candidate };
    }
    else if (action === "get_outcome_reviews") data = { items: reviewItems, core_context_revision: 1 };
    else if (action === "save_outcome_review") data = { review: {} };
    else if (action === "save_structure_revision") {
      const next = JSON.parse(String(body.get("structure") || "{}"));
      data = { structure_revision: { ...next, revision: Number(next.revision || 1) + 1, week_reviews: weekReviews }, coverage: [] };
    }
    else if (action === "seal_structure") data = { structure_revision: structure() };
    else if (action === "get_activity_intents") {
      if (harnessOptions.deferActivityLoads) await new Promise<void>((resolve) => activityLoadResolvers.push(resolve));
      const sectionRef = body.get("section_ref");
      data = { intents: activityIntents.filter((item) => !item.section_ref || item.section_ref === sectionRef) };
    }
    else if (action === "get_section_material_snapshot") data = harnessOptions.materialStatus ?? (harnessOptions.materialSnapshot ? { status: "ready", snapshot: harnessOptions.materialSnapshot, planned_resources: [] } : { status: "fallback", snapshot: null, planned_resources: [] });
    else if (action === "upload_section_material") data = { uploaded: true };
    else if (action === "seal_section_material") data = { status: "ready", snapshot: { id: "snapshot-new", persisted_id: "snapshot-new", revision: 2 }, planned_resources: [] };
    else if (action === "get_activity_status") data = activityIntents.find((item) => item.activity_ref === body.get("activity_ref")) ?? null;
    else if (action === "get_competency_mappings") data = { revision: 1, mappings: [] };
    else if (action === "set_activity_intents") {
      if (harnessOptions.deferIntentSaves) await new Promise<void>((resolve) => intentSaveResolvers.push(resolve));
      const quiz = activityIntents.find((item) => item.activity_type === "quiz");
      const assignment = activityIntents.find((item) => item.activity_type === "assignment");
      if (quiz && body.has("quiz_selected_objective_ids")) quiz.selected_objective_ids = JSON.parse(String(body.get("quiz_selected_objective_ids") || "[]"));
      if (assignment && body.has("assignment_selected_objective_ids")) assignment.selected_objective_ids = JSON.parse(String(body.get("assignment_selected_objective_ids") || "[]"));
      if (quiz && body.has("quiz_selected_outcome_ids")) quiz.selected_outcome_ids = JSON.parse(String(body.get("quiz_selected_outcome_ids") || "[]"));
      if (assignment && body.has("assignment_selected_outcome_ids")) assignment.selected_outcome_ids = JSON.parse(String(body.get("assignment_selected_outcome_ids") || "[]"));
      if (quiz && body.has("quiz_alignment_override")) { const value = JSON.parse(String(body.get("quiz_alignment_override") || "{}")); quiz.alignment_override = Object.keys(value).length ? value : null; }
      if (assignment && body.has("assignment_alignment_override")) { const value = JSON.parse(String(body.get("assignment_alignment_override") || "{}")); assignment.alignment_override = Object.keys(value).length ? value : null; }
      if (quiz && body.has("quiz_generation_instruction")) quiz.generation_instruction = String(body.get("quiz_generation_instruction") || "");
      if (assignment && body.has("assignment_generation_instruction")) assignment.generation_instruction = String(body.get("assignment_generation_instruction") || "");
      data = { intents: activityIntents };
    }
    else if (action === "save_activity_edit") {
      const edited = JSON.parse(String(body.get("activity") || "{}"));
      const current = activityIntents.find((item) => item.activity_ref === body.get("activity_ref"));
      if (current) { current.activity = edited; current.content_provenance = "TEACHER_EDITED"; current.activity_revision = Number(current.activity_revision || 1) + 1; }
      data = current;
    }
    else if (action === "generate_activity") {
      const current = activityIntents.find((item) => item.activity_ref === body.get("activity_ref"));
      if (current) {
        body.set("_selected_outcomes_at_generate", JSON.stringify(current.selected_outcome_ids || []));
        current.status = "generated"; current.error = null;
      }
      data = current;
    }

    else if (action === "mark_week_reviewed") {
      const week = weekReviews.find((item) => item.section_ref === body.get("section_ref"));
      if (week) { week.status = "Ready to configure"; week.reviewed_at = "2026-09-18T00:00:00Z" as any; }
      data = { structure_revision: structure() };
    }
    else if (action === "approve_learning_outcome") {
      coreContext.revision = 2;
      coreContext.approved_learning_outcomes = [{ outcome_id: "outcome-1", text: "Use loops carefully", source_outcome_ids: ["source-outcome-1"], source_refs: coreContext.source_learning_outcomes[0].source_refs, approval_origin: "TEACHER_EDITED", approved_by_teacher: true, revision: 2 }];
      reviewItems[1]!.status = "APPROVED";
      reviewItems[1]!.authoritative_text = "Use loops carefully";
      reviewItems[1]!.approved_outcome_id = "outcome-1";
      data = { core_context: coreContext, alignment_status: "STALE_ALIGNMENT" };
    }
    else if (action === "edit_approved_learning_outcome") {
      const teacherText = body.get("teacher_text") || "";
      coreContext.revision = 2;
      coreContext.approved_learning_outcomes = [];
      reviewItems[1]!.status = "REVIEWED";
      reviewItems[1]!.draft_text = teacherText;
      reviewItems[1]!.approved_outcome_id = null;
      structureStale = true;
      data = { core_context: coreContext, review: reviewItems[1], stale: { structure_alignment: true, activity_count: 1, competency_candidate_count: 1 } };
    }
    return { ok: true, json: async () => ({ success: true, data }) };
  };

  let module: any;
  const $ = (selector: any) => selector instanceof FakeElement ? new FakeSelection(dom, [selector]) : dom.query(String(selector));
  runInNewContext(source, {
    define: (_deps: string[], factory: Function) => { module = factory($, { setOptionalString() {}, removeSection() {}, normalizeSectionPositions() {}, nextSectionDescriptor() { return { ref: "x", position: 1, number: 1 }; } }, { render: () => "" }); },
    fetch: fakeFetch,
    URL,
    URLSearchParams,
    FormData,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    document: { createTextNode: (text: string) => ({ textContent: text }) },
    window: {
      location: { href: "http://localhost/course/create.php?context_run_id=run-review" + (options.selectedWeekRef ? "&week_ref=" + options.selectedWeekRef : "") + (options.selectedActivityWeekRef ? "&activity_week_ref=" + options.selectedActivityWeekRef : ""), reload() {} },
      history: { replaceState() {} },
      localStorage,
      alert: () => {},
      confirm: (message: string) => { confirmCalls.push(message); return options.confirmResult ?? true; },
      addEventListener: (event: string, handler: (event: any) => void) => {
        const list = windowEvents.get(event) ?? []; list.push(handler); windowEvents.set(event, list);
      },
    },
    alert: () => {},
    console,
    M: { cfg: { wwwroot: "http://localhost" } },
    confirm: () => options.confirmResult ?? true,
  });
  module.init({ sesskey: "test", ajaxurl: "http://localhost/ajax.php", categories: [] });
  return { dom, calls, activityLoadResolvers, intentSaveResolvers, candidateDecisionResolvers, localStorageData, windowEvents, confirmCalls };
}

describe("UX/UI Ticket 01 Outcome Review Workbench interaction semantics", () => {
  it("restores keyboard focus to the selected review surface after explicit Save read-back", async () => {
    const { dom, calls } = harness();
    await flushPromises(); await flushPromises(); await flushPromises();

    dom.query("#outcome-review-text").val("Saved teacher wording");
    dom.query("#outcome-review-save").trigger("focus").trigger("click");
    await flushPromises(); await flushPromises();

    expect(calls.some((call) => call.action === "save_outcome_review")).toBe(true);
    expect(dom.focused?.id).toBe("outcome-review-text");
  });

  it("keeps unsaved LO edits local, exposes no LO approval, and moves focus through Next", async () => {
    const { dom, calls } = harness();
    await flushPromises(); await flushPromises(); await flushPromises();

    expect(dom.byId.get("outcome-review-text")?.value).toBe("Explain loops");
    expect(dom.byId.has("outcome-review-approve")).toBe(false);

    dom.query("#outcome-review-text").val("UNSAVED teacher wording");
    dom.query("#outcome-review-next").trigger("click");

    expect(calls.some((call) => call.action === "save_outcome_review")).toBe(false);
    expect(dom.focused?.id).toBe("outcome-review-text");
    expect(dom.byId.has("outcome-review-approve")).toBe(true);

    const loNav = dom.byText("Explain loops", "button").find((element) => element.classes.has("outcome-review-nav-item"));
    expect(loNav).toBeTruthy();
    new FakeSelection(dom, [loNav!]).trigger("click");
    expect(dom.byId.get("outcome-review-text")?.value).toBe("Explain loops");
    expect(dom.focused?.id).toBe("outcome-review-text");
    expect(dom.byId.has("outcome-review-approve")).toBe(false);
  });

  it("renders individual CLO approval only and no bulk-approval control", async () => {
    const { dom } = harness();
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#outcome-review-next").trigger("click");

    const approve = dom.byId.get("outcome-review-approve");
    expect(approve?.allText()).toContain("Approve CLO");
    expect([...dom.all].filter((element) => element.tag === "button" && /bulk|approve all|approve selected/i.test(element.allText()))).toHaveLength(0);
    expect(dom.byText("Reviewed").length).toBeGreaterThan(0);
    expect([...dom.all].filter((element) => element.tag === "span" && element.classes.has("badge") && element.allText().includes("CLO Approved"))).toHaveLength(0);
    expect(dom.byId.has("approved-clo-edit-warning")).toBe(false);
  });

  it("blocks CLO approval while visible review wording or decision has unsaved changes", async () => {
    const { dom } = harness();
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#outcome-review-next").trigger("click");

    expect(dom.byId.get("outcome-review-approve")?.props.get("disabled")).not.toBe(true);

    dom.query("#outcome-review-text").val("UNSAVED reviewed wording").trigger("input");
    expect(dom.byId.get("outcome-review-approve")?.props.get("disabled")).toBe(true);

    dom.query("#outcome-review-text").val("Use loops carefully").trigger("input");
    expect(dom.byId.get("outcome-review-approve")?.props.get("disabled")).not.toBe(true);

    dom.query("#outcome-review-status").val("NEEDS_REVISION").trigger("change");
    expect(dom.byId.get("outcome-review-approve")?.props.get("disabled")).toBe(true);
    expect(dom.byText("Save review changes before approving this CLO.").length).toBeGreaterThan(0);
  });

  it("cancels an approved CLO edit without any authority mutation", async () => {
    const { dom, calls } = harness({ approvedClo: true, confirmResult: false });
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#outcome-review-next").trigger("click");

    expect(dom.byId.get("outcome-review-text")?.props.get("disabled")).not.toBe(true);
    dom.query("#outcome-review-text").val("Changed approved wording").trigger("input");
    dom.query("#outcome-review-save").trigger("click");
    await flushPromises();

    expect(calls.some((call) => call.action === "edit_approved_learning_outcome")).toBe(false);
    expect(dom.byText("CLO Approved").length).toBeGreaterThan(0);
  });

  it("confirms an approved CLO edit, reads back Reviewed + Stale, and never auto-regenerates", async () => {
    const { dom, calls } = harness({ approvedClo: true, confirmResult: true });
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#outcome-review-next").trigger("click");
    dom.query("#outcome-review-text").val("Changed approved wording").trigger("input");
    dom.query("#outcome-review-save").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises();

    expect(calls.some((call) => call.action === "edit_approved_learning_outcome" && call.body.get("teacher_text") === "Changed approved wording")).toBe(true);
    expect(calls.some((call) => ["generate_activity", "generate_section_activities", "rebase_structure_alignment"].includes(call.action))).toBe(false);
    expect(dom.byText("Reviewed").length).toBeGreaterThan(0);
    expect(dom.byText("Stale").length).toBeGreaterThan(0);
  });


  it("preserves Outcome navigator scroll position after CLO approval read-back", async () => {
    const { dom, calls } = harness();
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#outcome-review-next").trigger("click");

    const $nav = dom.query(".outcome-review-nav");
    $nav.scrollTop(180).trigger("scroll");
    expect($nav.scrollTop()).toBe(180);

    dom.query("#outcome-review-approve").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises();

    expect(calls.some((call) => call.action === "approve_learning_outcome")).toBe(true);
    expect(dom.query(".outcome-review-nav").scrollTop()).toBe(180);
  });

});

describe("UX/UI Competency Candidate authority interactions", () => {
  it("shows semantic Candidate status without rerendering the Outcome workbench", async () => {
    const candidate = {
      candidate_id: "candidate-1", revision: 1, name: "Program design", description: "Design programs",
      rationale: "Approved Outcome", derived_from_outcome_ids: ["outcome-1"], source_refs: [], status: "PROPOSED",
    };
    const { dom } = harness({ approvedClo: true, reviewedLo: true, competencyCandidates: [candidate] });
    await flushPromises(); await flushPromises(); await flushPromises();
    const outcomeEditorBefore = dom.byId.get("outcome-review-text");

    new FakeSelection(dom, [dom.byText("Approve Candidate", "button")[0]!]).trigger("click");
    await flushPromises(); await flushPromises();

    expect(dom.byId.get("outcome-review-text")).toBe(outcomeEditorBefore);
    expect(dom.query(".competency-status-approved").text()).toContain("Approved");
    expect(dom.query(".competency-candidate-card").elements[0]!.classes.has("border-success")).toBe(true);
  });

  it("does not let a second Candidate mutation start while the first decision is in flight", async () => {
    const candidate = {
      candidate_id: "candidate-1", revision: 1, name: "Program design", description: "Design programs",
      rationale: "Approved Outcome", derived_from_outcome_ids: ["outcome-1"], source_refs: [], status: "PROPOSED",
    };
    const { dom, calls, candidateDecisionResolvers } = harness({
      approvedClo: true,
      reviewedLo: true,
      competencyCandidates: [candidate],
      deferCandidateDecisions: true,
    });
    await flushPromises(); await flushPromises(); await flushPromises();

    new FakeSelection(dom, [dom.byText("Save Candidate edit", "button")[0]!]).trigger("click");
    new FakeSelection(dom, [dom.byText("Approve Candidate", "button")[0]!]).trigger("click");
    await flushPromises();

    expect(calls.filter((call) => call.action === "decide_competency_candidate")).toHaveLength(1);
    expect(candidateDecisionResolvers).toHaveLength(1);
  });

  it("releases the Candidate mutation barrier when conflict read-back also fails", async () => {
    const failActions: string[] = [];
    const candidate = {
      candidate_id: "candidate-1", revision: 1, name: "Program design", description: "Design programs",
      rationale: "Approved Outcome", derived_from_outcome_ids: ["outcome-1"], source_refs: [], status: "PROPOSED",
    };
    const { dom } = harness({
      approvedClo: true, reviewedLo: true, competencyCandidates: [candidate], candidateDecisionConflict: true, failActions,
    });
    await flushPromises(); await flushPromises(); await flushPromises();

    failActions.push("get_instructional_design");
    new FakeSelection(dom, [dom.byText("Approve Candidate", "button")[0]!]).trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises();

    expect(dom.byText("Save Candidate edit", "button")[0]!.props.get("disabled")).not.toBe(true);
    expect(dom.byText("Approve Candidate", "button")[0]!.props.get("disabled")).not.toBe(true);
    expect(dom.query("#builder-error-message").text()).toContain("latest server state could not be reloaded");
  });
});



describe("UX/UI Ticket 03 Week review workbench", () => {
  it("shows only the selected Week and its LO/CLO mappings while the rail lists all Weeks", async () => {
    const { dom, calls } = harness({ approvedClo: true, reviewedLo: true, weekCount: 3 });
    await flushPromises(); await flushPromises(); await flushPromises();
    expect(dom.query(".week-review-nav-item").length).toBe(3);
    expect(dom.query(".week-review-workspace").text()).toContain("Week 1");
    expect(dom.query(".week-selected-context").text()).toContain("Currently reviewing");
    expect(dom.query(".week-selected-context").text()).toContain("Week 1");
    expect(dom.query(".week-review-nav-item").elements[0]!.classes.has("week-nav-current")).toBe(true);
    expect(dom.query(".week-review-workspace").text()).not.toContain("Week 2");
    const week2 = [...dom.all].find((item) => item.attrs.get("data-week-ref") === "section-02");
    new FakeSelection(dom, [week2!]).trigger("click");
    expect(dom.query(".week-review-workspace").text()).toContain("Week 2");
    expect(dom.query(".week-review-workspace").text()).not.toContain("Week 1");
    expect(dom.query("#instructional-design-review").text()).toContain("LO / Objectives");
    expect(dom.query("#instructional-design-review").text()).toContain("CLO / Outcomes");
    expect(calls.some((call) => call.action === "approve_learning_outcome")).toBe(false);
  });

  it("marks only the selected Week reviewed through the BFF and never approves a CLO", async () => {
    const { dom, calls } = harness({ approvedClo: true, reviewedLo: true, weekCount: 3, selectedWeekRef: "section-02" });
    await flushPromises(); await flushPromises(); await flushPromises();
    const action = dom.query(".week-mark-reviewed");
    expect(action.text()).toBe("Mark Reviewed");
    action.trigger("click");
    await flushPromises(); await flushPromises();
    expect(calls.filter((call) => call.action === "mark_week_reviewed")).toHaveLength(1);
    expect(calls.find((call) => call.action === "mark_week_reviewed")!.body.get("section_ref")).toBe("section-02");
    expect(calls.some((call) => call.action === "approve_learning_outcome")).toBe(false);
    const week3 = [...dom.all].find((item) => item.attrs.get("data-week-ref") === "section-03");
    new FakeSelection(dom, [week3!]).trigger("click");
    const week2 = [...dom.all].find((item) => item.attrs.get("data-week-ref") === "section-02");
    new FakeSelection(dom, [week2!]).trigger("click");
    expect(dom.query(".week-review-rail").text()).toContain("Ready to configure");
    const reloaded = harness({ approvedClo: true, reviewedLo: true, weekCount: 3, selectedWeekRef: "section-02", weekStatuses: ["Pending review", "Ready to configure", "Pending review"] });
    await flushPromises(); await flushPromises(); await flushPromises();
    expect(reloaded.dom.query(".week-review-workspace").text()).toContain("Week 2");
    expect(reloaded.dom.query(".week-review-rail").text()).toContain("Ready to configure");
  });

  it("renders only the five approved Week labels and disables local review when Stale", async () => {
    const statuses = ["Pending review", "Ready to configure", "In progress", "Ready", "Stale"];
    const { dom } = harness({ approvedClo: true, reviewedLo: true, weekCount: 5, weekStatuses: statuses, selectedWeekRef: "section-05" });
    await flushPromises(); await flushPromises(); await flushPromises();
    const rail = dom.query(".week-review-rail").text();
    for (const status of statuses) expect(rail).toContain(status);
    expect(dom.query(".week-mark-reviewed").prop("disabled")).toBe(true);
  });
});


function activityFixtures(status = "generated") {
  const quiz = {
    section_ref: "section-02", activity_type: "quiz", activity_ref: "quiz-02", status, attempt_count: 1, max_attempts: 3,
    purpose: "PRACTICE", selected_objective_ids: ["objective-1"], selected_outcome_ids: ["outcome-1"],
    learner_context_acknowledged: true, intent_revision: 2, activity_revision: 3, source_generation_revision: 3,
    content_provenance: "AI_GENERATED", grounding_mode: "MATERIAL_GROUNDED", material_snapshot_id: "snapshot-1",
    options: { question_count: 2, question_type: "multichoice", choices_per_question: 2 }, review_required: true,
    quality_review: { outcome_alignment: "PASS", learner_level_fit: "PASS", scope_compliance: "PASS", purpose_fit: "PASS", warnings: [] },
    generation_metadata: { activity_intent_revision: 2, core_context_revision: 1 },
    activity: { type: "quiz", ref: "quiz-02", title: "Week 2 Quiz", description: "Compact quiz", source_refs: [{ source: "week2.pdf", page: 2 }], questions: [
      { ref: "q1", type: "multichoice", question: "Question one", default_mark: 1, choices: [{ ref: "a", text: "A" }, { ref: "b", text: "B" }], correct_choice_refs: ["a"], feedback: "F1", source_refs: [{ source: "week2.pdf", page: 2 }] },
      { ref: "q2", type: "multichoice", question: "Question two", default_mark: 1, choices: [{ ref: "a", text: "C" }, { ref: "b", text: "D" }], correct_choice_refs: ["b"], feedback: "F2", source_refs: [{ source: "week2.pdf", page: 3 }] },
    ] },
  };
  const assignment = {
    section_ref: "section-02", activity_type: "assignment", activity_ref: "assignment-02", status: "generated", attempt_count: 1, max_attempts: 3,
    purpose: "FORMATIVE", selected_objective_ids: [], selected_outcome_ids: ["outcome-1"], learner_context_acknowledged: true,
    intent_revision: 2, activity_revision: 1, source_generation_revision: 1, content_provenance: "AI_GENERATED",
    grounding_mode: "MATERIAL_GROUNDED", material_snapshot_id: "snapshot-1", options: { grade: 100 },
    quality_review: { outcome_alignment: "PASS", learner_level_fit: "PASS", scope_compliance: "PASS", purpose_fit: "PASS", warnings: [] },
    activity: { type: "assignment", ref: "assignment-02", title: "Week 2 Assignment", description: "Build a class", instructions: ["Implement", "Explain"], learning_objectives: ["Apply loops"], grade: 100, source_refs: [{ source: "week2.pdf", page: 4 }] },
  };
  return [quiz, assignment];
}

async function activityHarness(status = "generated") {
  const result = harness({ approvedClo: true, reviewedLo: true, weekCount: 3,
    weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"], selectedActivityWeekRef: "section-02",
    activityIntents: activityFixtures(status),
    materialSnapshot: { id: "snapshot-1", persisted_id: "snapshot-1", revision: 1, files: [{ filename: "week2.pdf" }] } });
  await flushPromises(); await flushPromises(); await flushPromises();
  result.dom.query("#btn-review-continue").trigger("click");
  await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();
  return result;
}


describe("UX/UI Ticket 05 Recoverable Local Drafts interaction semantics", () => {
  it("tells the Teacher when a local recovery snapshot cannot be saved", async () => {
    const { dom, localStorageData } = harness({ approvedClo: true, reviewedLo: true, weekCount: 1, localStorageWriteFails: true });
    await flushPromises(); await flushPromises(); await flushPromises();

    dom.query("#btn-edit-course-title").trigger("click");
    dom.query("#input-edit-course-title").val("Unsaved title").trigger("input");

    expect(localStorageData.size).toBe(0);
    expect(dom.query("#builder-error-message").text()).toContain("recovery draft could not be saved");
  });

  it("does not replace a matching Week recovery snapshot until Teacher explicitly restores or discards it", async () => {
    const key = "moodle-agent-draft:run-review:structure-week:section-01";
    const original = JSON.stringify({
      run_id: "run-review", surface: "structure-week", entity_ref: "section-01", base_revision: 1,
      payload: { title: "Recovered Week 1", summary: "Recovered summary", aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"] },
      saved_at: "2026-09-21T00:00:00.000Z",
    });
    const { dom, calls, localStorageData } = harness({
      approvedClo: true, reviewedLo: true, weekCount: 1, selectedWeekRef: "section-01",
      localStorageSeed: { [key]: original },
    });
    await flushPromises(); await flushPromises(); await flushPromises();

    const edit = dom.byText("Edit", "button")[0]!;
    expect(edit).toBeTruthy();
    new FakeSelection(dom, [edit]).trigger("click");
    dom.query("#input-edit-section-title").val("Fresh replacement").trigger("input");

    expect(JSON.parse(localStorageData.get(key)!).payload.title).toBe("Recovered Week 1");
    const restore = dom.byText("Restore draft", "button")[0]!;
    expect(restore).toBeTruthy();
    new FakeSelection(dom, [restore]).trigger("click");
    expect(dom.query("#input-edit-section-title").val()).toBe("Recovered Week 1");

    dom.query("#input-edit-section-title").val("Continued recovered draft").trigger("input");
    expect(JSON.parse(localStorageData.get(key)!).payload.title).toBe("Continued recovered draft");
    expect(calls.some((call) => call.action === "save_structure_revision")).toBe(false);

    dom.query("#btn-save-section").trigger("click");
    await flushPromises(); await flushPromises();
    expect(calls.some((call) => call.action === "save_structure_revision")).toBe(true);
    expect(localStorageData.has(key)).toBe(false);
  });

  it("shows Draft conflict for an advanced server revision and preserves the stale snapshot until Review or Discard", async () => {
    const key = "moodle-agent-draft:run-review:structure-week:section-01";
    const stale = JSON.stringify({
      run_id: "run-review", surface: "structure-week", entity_ref: "section-01", base_revision: 0,
      payload: { title: "Stale recovered Week", summary: "Older server base", aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"] },
      saved_at: "2026-09-20T00:00:00.000Z",
    });
    const { dom, calls, localStorageData } = harness({
      approvedClo: true, reviewedLo: true, weekCount: 1, selectedWeekRef: "section-01",
      localStorageSeed: { [key]: stale },
    });
    await flushPromises(); await flushPromises(); await flushPromises();

    expect(dom.byText("Draft conflict").length).toBeGreaterThan(0);
    expect(dom.byText("Review draft", "button").length).toBe(1);
    expect(dom.byText("Restore draft", "button")).toHaveLength(0);

    const edit = dom.byText("Edit", "button")[0]!;
    new FakeSelection(dom, [edit]).trigger("click");
    dom.query("#input-edit-section-title").val("Attempted overwrite").trigger("input");
    expect(JSON.parse(localStorageData.get(key)!).payload.title).toBe("Stale recovered Week");
    expect(calls.some((call) => call.action === "save_structure_revision")).toBe(false);

    const discard = dom.byText("Discard", "button")[0]!;
    new FakeSelection(dom, [discard]).trigger("click");
    expect(localStorageData.has(key)).toBe(false);
  });

  it("persists Course title/summary recovery, guards navigation, and clears recovery only after Save succeeds", async () => {
    const key = "moodle-agent-draft:run-review:course-identity:course";
    const { dom, calls, localStorageData } = harness({ approvedClo: true, reviewedLo: true, weekCount: 1 });
    await flushPromises(); await flushPromises(); await flushPromises();

    dom.query("#btn-edit-course-title").trigger("click");
    dom.query("#input-edit-course-title").val("Draft Course Title").trigger("input");
    dom.query("#input-edit-course-summary").val("Draft summary").trigger("input");

    expect(localStorageData.has(key)).toBe(true);
    expect(JSON.parse(localStorageData.get(key)!).payload).toMatchObject({ title: "Draft Course Title", summary: "Draft summary" });

    dom.query("#btn-review-back").trigger("click");
    const modal = dom.query(".draft-navigation-modal");
    expect(modal.length).toBe(1);
    expect(modal.find("button").elements.map((item) => item.allText())).toEqual(["Save", "Discard", "Cancel"]);
    const cancel = modal.find("button").elements.find((item) => item.allText() === "Cancel")!;
    new FakeSelection(dom, [cancel]).trigger("click");
    await flushPromises();
    expect(localStorageData.has(key)).toBe(true);

    dom.query("#btn-save-course-title").trigger("click");
    await flushPromises(); await flushPromises();
    expect(calls.some((call) => call.action === "save_structure_revision")).toBe(true);
    expect(localStorageData.has(key)).toBe(false);
  });

  it("routes Regenerate through the same Save / Discard / Cancel guard and reconciles Discard before regeneration", async () => {
    const key = "moodle-agent-draft:run-review:structure-week:section-01";
    const { dom, localStorageData } = harness({ approvedClo: true, reviewedLo: true, weekCount: 1, confirmResult: true });
    await flushPromises(); await flushPromises(); await flushPromises();

    const edit = dom.byText("Edit", "button")[0]!;
    new FakeSelection(dom, [edit]).trigger("click");
    dom.query("#input-edit-section-title").val("Dirty Week").trigger("input");
    expect(localStorageData.has(key)).toBe(true);

    dom.query("#btn-review-regenerate").trigger("click");
    let modal = dom.query(".draft-navigation-modal");
    expect(modal.length).toBe(1);
    expect(modal.find("button").elements.map((item) => item.allText())).toEqual(["Save", "Discard", "Cancel"]);

    const cancel = modal.find("button").elements.find((item) => item.allText() === "Cancel")!;
    new FakeSelection(dom, [cancel]).trigger("click");
    await flushPromises();
    expect(localStorageData.has(key)).toBe(true);

    dom.query("#btn-review-regenerate").trigger("click");
    modal = dom.query(".draft-navigation-modal");
    const discard = modal.find("button").elements.find((item) => item.allText() === "Discard")!;
    new FakeSelection(dom, [discard]).trigger("click");
    await flushPromises();
    expect(localStorageData.has(key)).toBe(false);
  });

  it("keeps Activity edits local through Cancel and removes the recovery snapshot only on explicit Discard", async () => {
    const { dom, localStorageData } = await activityHarness();
    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    new FakeSelection(dom, [quizTab]).trigger("click");
    const edit = dom.byText("Edit Activity Content", "button")[0]!;
    new FakeSelection(dom, [edit]).trigger("click");
    const questionOne = [...dom.all].find((item) => item.tag === "textarea" && item.value === "Question one")!;
    new FakeSelection(dom, [questionOne]).val("Draft question one").trigger("input");

    const key = "moodle-agent-draft:run-review:activity-content:quiz-02";
    expect(localStorageData.has(key)).toBe(true);
    expect(JSON.parse(localStorageData.get(key)!).payload.questions[0].question).toBe("Draft question one");

    const q2 = [...dom.all].find((item) => item.tag === "button" && item.allText() === "Q2")!;
    new FakeSelection(dom, [q2]).trigger("click");
    let modal = dom.query(".draft-navigation-modal");
    expect(modal.find("button").elements.map((item) => item.allText())).toEqual(["Save", "Discard", "Cancel"]);

    const cancel = modal.find("button").elements.find((item) => item.allText() === "Cancel")!;
    new FakeSelection(dom, [cancel]).trigger("click");
    await flushPromises();
    expect(localStorageData.has(key)).toBe(true);

    new FakeSelection(dom, [q2]).trigger("click");
    modal = dom.query(".draft-navigation-modal");
    const discard = modal.find("button").elements.find((item) => item.allText() === "Discard")!;
    new FakeSelection(dom, [discard]).trigger("click");
    await flushPromises();
    expect(localStorageData.has(key)).toBe(false);
  });
});


describe("UX/UI Ticket 04 Activity Week Workbench", () => {
  it("renders a full long Thai Week title in the DOM and selected workspace without a stale overriding accessible name", async () => {
    const longTitle = "สัปดาห์ที่ 2: การออกแบบกิจกรรมการเรียนรู้เชิงประยุกต์ด้วยบริบทที่ยาวมากสำหรับผู้เรียน";
    const result = harness({ approvedClo: true, reviewedLo: true, weekCount: 3,
      weekTitles: ["Week 1", longTitle, "Week 3"],
      weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"], selectedActivityWeekRef: "section-02",
      activityIntents: activityFixtures(), materialSnapshot: { id: "snapshot-1", persisted_id: "snapshot-1", revision: 1, files: [{ filename: "week2.pdf" }] } });
    await flushPromises(); await flushPromises(); await flushPromises();
    result.dom.query("#btn-review-continue").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();

    const selectedWeek = [...result.dom.all].find((item) => item.classes.has("activity-week-nav-item") && item.attrs.get("data-week-ref") === "section-02")!;
    const fullLabel = `Week 2 · ${longTitle}`;
    expect(selectedWeek.attrs.get("title")).toBe(fullLabel);
    expect(selectedWeek.attrs.has("aria-label")).toBe(false);
    expect(selectedWeek.allText()).toContain(fullLabel);
    expect(selectedWeek.allText()).toContain("Ready");
    expect(new FakeSelection(result.dom, [selectedWeek]).find(".activity-week-nav-title").text()).toBe(fullLabel);
    expect(result.dom.query(".activity-selected-week-context").text()).toContain(fullLabel);
  });

  it("ignores obsolete Activity-load callbacks after switching Weeks", async () => {
    const result = harness({ approvedClo: true, reviewedLo: true, weekCount: 3,
      weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"], selectedActivityWeekRef: "section-02",
      activityIntents: activityFixtures(), deferActivityLoads: true });
    await flushPromises(); await flushPromises(); await flushPromises();
    result.dom.query("#btn-review-continue").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();
    expect(result.calls.map((call) => call.action)).toContain("seal_structure");
    expect(result.calls.map((call) => call.action)).toContain("get_activity_intents");
    expect(result.activityLoadResolvers).toHaveLength(3);
    const week1 = [...result.dom.all].find((item) => item.classes.has("activity-week-nav-item") && item.attrs.get("data-week-ref") === "section-01")!;
    new FakeSelection(result.dom, [week1]).trigger("click");
    await flushPromises();
    expect(result.activityLoadResolvers).toHaveLength(6);
    result.activityLoadResolvers.slice(0, 3).forEach((resolve) => resolve());
    await flushPromises(); await flushPromises();
    expect(result.dom.query("#btn-activity-finalize").prop("disabled")).toBe(true);
    result.activityLoadResolvers.slice(3).forEach((resolve) => resolve());
    await flushPromises(); await flushPromises();
    expect(result.calls.filter((call) => call.action === "get_activity_intents")).toHaveLength(6);
    expect(result.dom.query("#btn-activity-finalize").prop("disabled")).toBe(false);
  });

  it("renders one selected Week with Material, Quiz and Assignment tabs plus a compact inspector", async () => {
    const { dom } = await activityHarness();
    expect(dom.query(".activity-week-nav-item").length).toBe(3);
    expect(dom.query(".activity-week-workspace").text()).toContain("Week 2");
    expect(dom.query(".activity-selected-week-context").text()).toContain("Currently configuring");
    expect(dom.query(".activity-selected-week-context").text()).toContain("Week 2");
    const selectedWeek = dom.query(".activity-week-nav-item").elements.find((item) => item.attrs.get("aria-current") === "true")!;
    expect(selectedWeek.classes.has("week-nav-current")).toBe(true);
    expect(dom.query(".activity-week-workspace").text()).not.toContain("Week 1");
    expect(dom.query(".activity-review-tabs").text()).toContain("Material");
    expect(dom.query(".activity-review-tabs").text()).toContain("Quiz");
    expect(dom.query(".activity-review-tabs").text()).toContain("Assignment");
    expect(dom.query(".activity-context-inspector").text()).toContain("sealed MaterialSnapshot");
    expect(dom.query(".activity-context-inspector").text()).toContain("snapshot-1");
    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    new FakeSelection(dom, [quizTab]).trigger("click");
    expect(dom.query(".activity-context-inspector").text()).toContain("Intent: PRACTICE");
    expect(dom.query(".activity-context-inspector").text()).toContain("Grounding: MATERIAL_GROUNDED");
    expect(dom.query(".activity-context-inspector").text()).toContain("Provenance: AI Generated");
    expect(dom.query(".activity-context-inspector").text()).toContain("AI self-review");
    expect(dom.query(".activity-context-inspector").text()).toContain("Questions");
  });

  it("shows whether the Activity generation prompt is saved and ready", async () => {
    const { dom } = await activityHarness();
    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    new FakeSelection(dom, [quizTab]).trigger("click");

    expect(dom.query(".activity-intent-save-status").text()).toContain("No prompt saved");
    const prompt = dom.query(".activity-generation-prompt");
    prompt.val("Focus on applied examples").trigger("input");
    expect(dom.query(".activity-intent-save-status").text()).toContain("Unsaved changes");

    new FakeSelection(dom, [dom.byText("Save Intent", "button")[0]!]).trigger("click");
    await flushPromises(); await flushPromises();
    expect(dom.query(".activity-intent-save-status").text()).toContain("Saved and ready to generate");
  });

  it("saves an unaligned provisional Intent, blocks Generate until acknowledgment, then persists the review flag before generation", async () => {
    const { dom, calls } = await activityHarness("selected");
    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    new FakeSelection(dom, [quizTab]).trigger("click");
    dom.query("#activity-quiz-objectives-section-02").val([]);
    dom.query("#activity-quiz-outcomes-section-02").val([]).trigger("change");
    await flushPromises(); await flushPromises();

    const provisionalSave = calls.filter((call) => call.action === "set_activity_intents").at(-1)!;
    expect(JSON.parse(String(provisionalSave.body.get("quiz_alignment_override")))).toEqual({});
    expect(dom.query(".activity-alignment-review-warning").text()).toContain("No required LO/CLO selected");

    new FakeSelection(dom, [dom.byText("Retry Generate", "button")[0]!]).trigger("click");
    await flushPromises();
    expect(calls.filter((call) => call.action === "generate_activity")).toHaveLength(0);

    const reviewAck = dom.query(".activity-alignment-review-warning").find("input");
    reviewAck.prop("checked", true).trigger("change");
    await flushPromises(); await flushPromises();
    const confirmedSave = calls.filter((call) => call.action === "set_activity_intents").at(-1)!;
    expect(JSON.parse(String(confirmedSave.body.get("quiz_alignment_override")))).toMatchObject({ kind: "MISSING_ALIGNMENT", acknowledged: true });

    new FakeSelection(dom, [dom.byText("Retry Generate", "button")[0]!]).trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises();
    expect(calls.filter((call) => call.action === "generate_activity")).toHaveLength(1);
  });

  it("navigates Q1/Q2 while rendering one question and never exposes per-question regenerate", async () => {
    const { dom, calls } = await activityHarness();
    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    new FakeSelection(dom, [quizTab]).trigger("click");
    expect(dom.query(".quiz-question-nav-item").length).toBe(2);
    expect(dom.query(".quiz-question-detail").text()).toContain("Question one");
    expect(dom.query(".quiz-question-detail").text()).not.toContain("Question two");
    const q2 = [...dom.all].find((item) => item.tag === "button" && item.allText() === "Q2")!;
    new FakeSelection(dom, [q2]).trigger("click");
    expect(dom.focused?.allText()).toBe("Q2");
    expect(dom.query(".quiz-question-detail").text()).toContain("Question two");
    expect(dom.query(".quiz-question-detail").text()).not.toContain("Question one");
    expect([...dom.all].filter((item) => item.tag === "button" && /regenerate question/i.test(item.allText()))).toHaveLength(0);
    expect(calls.some((call) => /question/i.test(call.action) && /generate/i.test(call.action))).toBe(false);
  });

  it("does not persist on tab/question navigation and saves edited Activity only through explicit Save", async () => {
    const { dom, calls } = await activityHarness();
    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    new FakeSelection(dom, [quizTab]).trigger("click");
    const edit = dom.byText("Edit Activity Content", "button")[0]!;
    new FakeSelection(dom, [edit]).trigger("click");
    const questionOne = [...dom.all].find((item) => item.tag === "textarea" && item.value === "Question one")!;
    new FakeSelection(dom, [questionOne]).val("Unsaved question one");
    const q2 = [...dom.all].find((item) => item.tag === "button" && item.allText() === "Q2")!;
    new FakeSelection(dom, [q2]).trigger("click");
    expect(calls.some((call) => call.action === "save_activity_edit")).toBe(false);
    const editAgain = dom.byText("Edit Activity Content", "button")[0]!;
    new FakeSelection(dom, [editAgain]).trigger("click");
    const questionTwo = [...dom.all].find((item) => item.tag === "textarea" && item.value === "Question two")!;
    new FakeSelection(dom, [questionTwo]).val("Saved question two");
    const save = dom.byText("Save Teacher Edit", "button")[0]!;
    new FakeSelection(dom, [save]).trigger("click");
    await flushPromises(); await flushPromises();
    const request = calls.find((call) => call.action === "save_activity_edit");
    expect(request).toBeTruthy();
    const activity = JSON.parse(String(request!.body.get("activity")));
    expect(activity.questions[0].question).toBe("Question one");
    expect(activity.questions[1].question).toBe("Saved question two");
  });

  it("offers Teacher-triggered Activity regeneration only for stale Activity state", async () => {
    const { dom, calls } = await activityHarness("stale");
    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    new FakeSelection(dom, [quizTab]).trigger("click");
    const regenerate = dom.byText("Regenerate Activity", "button")[0]!;
    expect(regenerate).toBeTruthy();
    new FakeSelection(dom, [regenerate]).trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises();
    expect(calls.filter((call) => call.action === "generate_activity")).toHaveLength(1);
    expect(calls.some((call) => call.action === "regenerate_question")).toBe(false);
  });
});

describe("UX/UI Ticket 06 Partial Failure & Manual Stale Recovery", () => {
  it("shows independent Material, Quiz, and Assignment statuses when only Quiz fails", async () => {
    const intents = activityFixtures("failed");
    intents[0].error = "Quiz generation failed";
    const { dom } = harness({
      approvedClo: true, reviewedLo: true, weekCount: 3,
      weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"],
      selectedActivityWeekRef: "section-02", activityIntents: intents,
      materialSnapshot: { id: "snapshot-1", persisted_id: "snapshot-1", revision: 4, files: [{ filename: "week2.pdf" }] },
    });
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#btn-review-continue").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();

    const materialTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "material")!;
    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    const assignmentTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "assignment")!;
    expect(materialTab.allText()).toContain("Ready");
    expect(quizTab.allText()).toContain("Failed");
    expect(quizTab.allText()).not.toContain("Stale");
    expect(assignmentTab.allText()).toContain("Generated");
    new FakeSelection(dom, [materialTab]).trigger("click");
    expect(dom.query(".activity-context-inspector").text()).toContain("revision 4");
    new FakeSelection(dom, [assignmentTab]).trigger("click");
    expect(dom.query(".activity-context-inspector").text()).toContain("Activity revision 1");
  });

  it("waits for a newly selected CLO to persist before retrying generation", async () => {
    const intents = activityFixtures("failed");
    intents[0].selected_outcome_ids = ["outcome-old"];
    const { dom, calls, intentSaveResolvers } = harness({
      approvedClo: true, reviewedLo: true, weekCount: 3,
      weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"],
      selectedActivityWeekRef: "section-02", activityIntents: intents, deferIntentSaves: true,
    });
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#btn-review-continue").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();

    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    new FakeSelection(dom, [quizTab]).trigger("click");
    dom.query("#activity-quiz-outcomes-section-02").val(["outcome-1"]).trigger("change");
    const retry = dom.byText("Retry Generate", "button")[0]!;
    new FakeSelection(dom, [retry]).trigger("click");
    await flushPromises();

    expect(calls.filter((call) => call.action === "generate_activity")).toHaveLength(0);
    expect(intentSaveResolvers).toHaveLength(1);
    intentSaveResolvers.shift()!();
    await flushPromises(); await flushPromises(); await flushPromises();

    const generate = calls.find((call) => call.action === "generate_activity")!;
    expect(generate).toBeTruthy();
    expect(JSON.parse(String(generate.body.get("_selected_outcomes_at_generate")))).toEqual(["outcome-1"]);
  });

  it("retries only the failed Quiz and leaves the successful Assignment revision/status unchanged", async () => {
    const intents = activityFixtures("failed");
    intents[0].error = "Quiz generation failed";
    const assignmentBefore = { status: intents[1].status, activity_revision: intents[1].activity_revision, intent_revision: intents[1].intent_revision };
    const { dom, calls } = harness({
      approvedClo: true, reviewedLo: true, weekCount: 3,
      weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"],
      selectedActivityWeekRef: "section-02", activityIntents: intents,
    });
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#btn-review-continue").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();
    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    new FakeSelection(dom, [quizTab]).trigger("click");
    const before = calls.length;
    const retry = dom.byText("Retry Generate", "button")[0]!;
    new FakeSelection(dom, [retry]).trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises();
    const retryCalls = calls.slice(before);
    expect(retryCalls.filter((call) => call.action === "generate_activity")).toHaveLength(1);
    expect(retryCalls.find((call) => call.action === "generate_activity")!.body.get("activity_ref")).toBe("quiz-02");
    expect(retryCalls.filter((call) => call.action === "get_activity_status")).toHaveLength(1);
    expect(retryCalls.find((call) => call.action === "get_activity_status")!.body.get("activity_ref")).toBe("quiz-02");
    expect(retryCalls.some((call) => call.action === "set_activity_intents")).toBe(false);
    expect(intents[1]).toMatchObject(assignmentBefore);
  });

  it("does not regenerate stale artifacts on open and regenerates only the Teacher-selected stale artifact", async () => {
    const intents = activityFixtures("stale");
    const assignmentBefore = { status: intents[1].status, activity_revision: intents[1].activity_revision, intent_revision: intents[1].intent_revision };
    const { dom, calls } = harness({
      approvedClo: true, reviewedLo: true, weekCount: 3,
      weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"],
      selectedActivityWeekRef: "section-02", activityIntents: intents,
    });
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#btn-review-continue").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();
    expect(calls.some((call) => call.action === "generate_activity")).toBe(false);

    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    new FakeSelection(dom, [quizTab]).trigger("click");
    expect(quizTab.allText()).toContain("Stale");
    expect(quizTab.allText()).not.toContain("Failed");
    const before = calls.length;
    const regenerate = dom.byText("Regenerate Activity", "button")[0]!;
    new FakeSelection(dom, [regenerate]).trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises();
    const recoveryCalls = calls.slice(before);
    expect(recoveryCalls.filter((call) => call.action === "generate_activity")).toHaveLength(1);
    expect(recoveryCalls.filter((call) => call.action === "get_activity_status")).toHaveLength(1);
    expect(recoveryCalls.find((call) => call.action === "get_activity_status")!.body.get("activity_ref")).toBe("quiz-02");
    expect(recoveryCalls.some((call) => call.action === "set_activity_intents")).toBe(false);
    expect(intents[1]).toMatchObject(assignmentBefore);
  });



  it("keeps Activity statuses when Material read-back fails instead of failing the whole Week reload", async () => {
    const intents = activityFixtures("generated");
    const { dom } = harness({
      approvedClo: true, reviewedLo: true, weekCount: 3,
      weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"],
      selectedActivityWeekRef: "section-02", activityIntents: intents,
      failActions: ["get_section_material_snapshot"],
    });
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#btn-review-continue").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();
    const quizTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "quiz")!;
    const assignmentTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "assignment")!;
    expect(quizTab.allText()).toContain("Generated");
    expect(assignmentTab.allText()).toContain("Generated");
  });

  it("keeps authoritative Material state when Activity read-back fails", async () => {
    const { dom } = harness({
      approvedClo: true, reviewedLo: true, weekCount: 3,
      weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"],
      selectedActivityWeekRef: "section-02",
      materialSnapshot: { id: "snapshot-9", persisted_id: "snapshot-9", revision: 9, files: [{ filename: "week2.pdf" }] },
      failActions: ["get_activity_intents"],
    });
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#btn-review-continue").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();
    const materialTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "material")!;
    expect(materialTab.allText()).toContain("Ready");
    new FakeSelection(dom, [materialTab]).trigger("click");
    expect(dom.query(".activity-context-inspector").text()).toContain("revision 9");
  });

  it("keeps a successful Material save distinct when only post-seal Activity read-back fails", async () => {
    const failActions: string[] = [];
    const { dom, calls } = harness({
      approvedClo: true, reviewedLo: true, weekCount: 3,
      weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"],
      selectedActivityWeekRef: "section-02", activityIntents: activityFixtures("generated"), failActions,
    });
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#btn-review-continue").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();

    failActions.push("get_activity_intents");
    const fileInput = dom.query(".form-control-file").elements[0]!;
    (fileInput as any).files = [{ name: "replacement.pdf", size: 1024 }];
    new FakeSelection(dom, [fileInput]).trigger("change");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();

    expect(calls.some((call) => call.action === "upload_section_material")).toBe(true);
    expect(calls.some((call) => call.action === "seal_section_material")).toBe(true);
    expect(dom.query("#builder-error-message").text()).toContain("Learning Material saved, but Activity status refresh failed");
    expect(dom.query("#builder-error-message").text()).not.toContain("Learning Material save failed");
    const materialTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "material")!;
    expect(materialTab.allText()).toContain("Ready");
  });

  it("renders authoritative Material failure distinctly from intentional syllabus fallback and restores it on reload", async () => {
    const { dom } = harness({
      approvedClo: true, reviewedLo: true, weekCount: 3,
      weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"],
      selectedActivityWeekRef: "section-02",
      materialStatus: { status: "failed", snapshot: null, planned_resources: [], error: { code: "MATERIAL_EXTRACTION_FAILED", message: "No readable text" } },
    });
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#btn-review-continue").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();
    const materialTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "material")!;
    expect(materialTab.allText()).toContain("Failed");
    expect(materialTab.allText()).not.toContain("Syllabus fallback");
    new FakeSelection(dom, [materialTab]).trigger("click");
    expect(dom.query(".activity-context-inspector").text()).toContain("MATERIAL_EXTRACTION_FAILED");
  });

  it("reloads Material status and revision from the authoritative latest MaterialSnapshot even before Activity generation", async () => {
    const { dom, calls } = harness({
      approvedClo: true, reviewedLo: true, weekCount: 3,
      weekStatuses: ["Ready to configure", "Ready to configure", "Ready to configure"],
      selectedActivityWeekRef: "section-02", activityIntents: [],
      materialSnapshot: { id: "snapshot-7", persisted_id: "snapshot-7", revision: 7, files: [{ filename: "week2.pdf" }] },
    });
    await flushPromises(); await flushPromises(); await flushPromises();
    dom.query("#btn-review-continue").trigger("click");
    await flushPromises(); await flushPromises(); await flushPromises(); await flushPromises();
    expect(calls.some((call) => call.action === "get_section_material_snapshot")).toBe(true);
    const materialTab = [...dom.all].find((item) => item.attrs.get("data-activity-tab") === "material")!;
    expect(materialTab.allText()).toContain("Ready");
    new FakeSelection(dom, [materialTab]).trigger("click");
    expect(dom.query(".activity-context-inspector").text()).toContain("revision 7");
  });
});
