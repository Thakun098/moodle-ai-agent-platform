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
      else for (const eventName of events.split(/\s+/).filter(Boolean)) element.handlers.delete(eventName);
    }
    return this;
  }
  trigger(eventName: string) {
    for (const element of this.elements) {
      if (eventName === "focus") this.env.focused = element;
      for (const handler of element.handlers.get(eventName) ?? []) handler({ preventDefault() {}, stopPropagation() {}, target: element });
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
        if (value instanceof FakeSelection) element.children.push(...value.elements);
        else if (value instanceof FakeElement) element.children.push(value);
        else if (value && typeof value === "object" && "textContent" in value) element.children.push(String(value.textContent));
        else if (value !== undefined && value !== null) element.children.push(String(value));
      }
    }
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
  modal() { return this; }
  animate() { return this; }
  offset() { return { top: 0 }; }
}

class FakeDom {
  all = new Set<FakeElement>();
  byId = new Map<string, FakeElement>();
  focused: FakeElement | null = null;

  create(tag = "div") { const element = new FakeElement(tag); this.all.add(element); return element; }
  setId(element: FakeElement, id: string) { element.id = id; element.attrs.set("id", id); this.byId.set(id, element); }
  removeTree(element: FakeElement) { for (const child of element.children) if (child instanceof FakeElement) this.removeTree(child); if (element.id && this.byId.get(element.id) === element) this.byId.delete(element.id); this.all.delete(element); }
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
    const pool = roots ? this.descendants(roots) : [...this.all];
    const disabledFilter = selector.includes(":not(:disabled)");
    const clean = selector.replace(/:not\(:disabled\)/g, "").trim();
    let matched: FakeElement[] = [];
    if (/^#[A-Za-z0-9_-]+$/.test(clean)) {
      const element = this.byId.get(clean.slice(1));
      matched = element ? [element] : [];
    } else if (/^\.[A-Za-z0-9_-]+$/.test(clean)) {
      matched = pool.filter((element) => element.classes.has(clean.slice(1)));
    } else if (/^[A-Za-z0-9_-]+$/.test(clean)) {
      matched = pool.filter((element) => element.tag === clean.toLowerCase());
    } else if (/^option\[data-outside-section=["']1["']\]$/.test(clean)) {
      matched = pool.filter((element) => element.tag === "option" && element.attrs.get("data-outside-section") === "1");
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

function harness() {
  const source = readFileSync("moodle/local_agentpoc/amd/src/course_builder.js", "utf8");
  const dom = new FakeDom();
  for (const [id, tag] of [
    ["outcome-review-workbench", "div"], ["core-course-design-context", "section"], ["instructional-design-review", "div"],
    ["preview-sections-container", "div"], ["preview-warnings-list", "ul"], ["btn-review-continue", "button"],
    ["course-category-select", "select"], ["course-format-select", "select"], ["step-view-review", "div"], ["step-view-upload", "div"],
  ] as const) dom.mount(id, tag);

  const calls: Array<{ action: string; body: URLSearchParams }> = [];
  const coreContext = {
    revision: 1,
    learning_objectives: [{ objective_id: "objective-1", source_text: "Explain loops", source_refs: [{ start_line: 4, end_line: 4, text: "Explain loops" }] }],
    source_learning_outcomes: [{ source_outcome_id: "source-outcome-1", source_text: "Use loops", source_refs: [{ start_line: 5, end_line: 5, text: "Use loops" }] }],
    approved_learning_outcomes: [],
    learner_context: { status: "UNSPECIFIED" },
  };
  const reviewItems = [
    { item_type: "LO", item_id: "objective-1", status: "PENDING_REVIEW", source_text: "Explain loops", authoritative_text: "Explain loops", draft_text: null, source_refs: coreContext.learning_objectives[0].source_refs },
    { item_type: "CLO", item_id: "source-outcome-1", status: "REVIEWED", source_text: "Use loops", authoritative_text: "Use loops", draft_text: "Use loops carefully", source_refs: coreContext.source_learning_outcomes[0].source_refs },
  ];

  const fakeFetch = async (url: string, options: any) => {
    const action = new URL(url, "http://localhost").searchParams.get("action") ?? "";
    const body = new URLSearchParams(options?.body ?? "");
    calls.push({ action, body });
    let data: any = {};
    if (action === "get_instructional_design") data = { core_context: coreContext, outcome_proposals: [], competency_candidates: [], coverage: [], structure_revision: { revision: 1, title: "Course", summary: "Summary", content: { course: { title: "Course" }, sections: [] }, teacher_constraints: {} } };
    else if (action === "get_competency_candidates") data = { candidates: [] };
    else if (action === "get_outcome_reviews") data = { items: reviewItems, core_context_revision: 1 };
    else if (action === "save_outcome_review") data = { review: {} };
    return { ok: true, json: async () => ({ success: true, data }) };
  };

  let module: any;
  const $ = (selector: any) => selector instanceof FakeElement ? new FakeSelection(dom, [selector]) : dom.query(String(selector));
  runInNewContext(source, {
    define: (_deps: string[], factory: Function) => { module = factory($, { setOptionalString() {}, removeSection() {}, normalizeSectionPositions() {}, nextSectionDescriptor() { return { ref: "x", position: 1, number: 1 }; } }, { render: () => "" }); },
    fetch: fakeFetch,
    URL,
    URLSearchParams,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    document: { createTextNode: (text: string) => ({ textContent: text }) },
    window: { location: { href: "http://localhost/course/create.php?context_run_id=run-review", reload() {} }, history: { replaceState() {} }, confirm: () => true },
    alert: () => {},
    console,
    M: { cfg: { wwwroot: "http://localhost" } },
    confirm: () => true,
  });
  module.init({ sesskey: "test", ajaxurl: "http://localhost/ajax.php", categories: [] });
  return { dom, calls };
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
    expect(dom.byText("CLO Approved").length).toBe(0);
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
});
