# Issue tracker: Shared Local Markdown

This repo uses a custom local Markdown Issue tracker stored **outside Git worktrees** so every linked worktree/session sees the same frontier.

Tracker root: `C:\moodle-prac\ai-platform-coordination\tickets`
Helper CLI: `node C:\moodle-prac\ai-platform-coordination\tracker.mjs <command>`

This is the configured Issue tracker for Matt Pocock engineering skills. Do not create duplicate GitHub Issues unless the user explicitly switches trackers.

## Conventions

- One Issue per Markdown file.
- Issue IDs are global, numeric, blockers-first, and never reused. Existing IDs 01–29 remain stable.
- Active Issues live at `tickets\NN-<slug>.md`.
- Resolved Issues live at `tickets\closed-tickets\NN-<slug>.md`.
- New specs live at `tickets\specs\<feature-slug>.md` unless an already-established workspace plan/spec is the canonical parent.
- Wayfinder maps live at `tickets\maps\<effort-slug>.md`.
- Templates live at `tickets\_templates\issue.md`, `map.md`, and `spec.md`.
- Comments/history append under `## Comments`; closure evidence belongs in the current daily SOC/Audit, not duplicated into a separate evidence diary.

### Issue metadata

Every Issue has these lines near the top:

- `Status:` — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `claimed`, `resolved`, or `wontfix`.
- `Type:` — normally `task`; Wayfinder children may use `research`, `prototype`, `grilling`, or `task`.
- `Parent:` — optional spec path or Wayfinder map reference.
- `Blocked by:` — Issue IDs that must be `resolved` first, or `None`.
- `Claimed by:` — present only while `Status: claimed`.

`Blocked by:` is the canonical dependency edge. Do not duplicate dependency state as a separate `BLOCKED` status; frontier calculation derives it from the referenced Issues.

## When a skill says "publish to the issue tracker"

1. Run `node C:\moodle-prac\ai-platform-coordination\tracker.mjs next-id`.
2. Create one file at `C:\moodle-prac\ai-platform-coordination\tickets\NN-<slug>.md` using `tickets\_templates\issue.md`.
3. Number blockers before the Issue they block and put their IDs on `Blocked by:`.
4. For `/to-tickets` output, set `Status: ready-for-agent`; tracer bullets are agent-ready by construction.
5. Make each Issue a complete, demoable vertical slice. Avoid implementation file paths and line numbers unless a prototype produced a decision-rich snippet.
6. Preserve any pre-agreed test seam from the source spec under `## Test seams`.
7. Run `node C:\moodle-prac\ai-platform-coordination\tracker.mjs validate` after publishing.

## When a skill says "fetch the relevant ticket"

Run `node C:\moodle-prac\ai-platform-coordination\tracker.mjs show <NN>` or read the matching Issue file directly. Treat the Issue body plus its referenced parent spec/map as the requirement source; do not infer missing requirements from old SOC history.

## Frontier and execution

- `node ...\tracker.mjs frontier` lists Issues whose `Status` is `ready-for-agent`, whose blockers are all resolved, and which are not already claimed.
- `node ...\tracker.mjs claim <NN> --owner "<session/agent>"` is the session's first write. It changes the Issue to `Status: claimed`.
- Work one claimed Issue per fresh implementation context unless the user explicitly chooses otherwise.
- `node ...\tracker.mjs resolve <NN>` changes the Issue to `resolved`, appends an `## Answer` pointer to canonical closure evidence, and moves it to `closed-tickets`.
- `node ...\tracker.mjs reopen <NN>` moves a resolved Issue back to active state as `ready-for-agent`.
- Always run `node ...\tracker.mjs validate` after state/dependency edits.

## Wayfinding operations

Used by `/wayfinder`.

- **Map:** `tickets\maps\<effort-slug>.md`, containing Notes / Decisions-so-far / Fog. The map is an index, not the store of the decision.
- **Child Issue:** normal globally numbered Issue file in `tickets\`, with `Parent: map:<effort-slug>` and `Type: research|prototype|grilling|task`.
- **Blocking:** `Blocked by: NN, NN`; a child is unblocked only when every referenced Issue is `resolved`.
- **Frontier:** use `tracker.mjs frontier`; first by Issue number wins when no other prioritization was explicitly chosen.
- **Claim:** use `tracker.mjs claim` before doing work.
- **Resolve:** record the answer in the child Issue, set it resolved, and add only a one-line gist/context pointer under the map's `Decisions-so-far`.

## Triage compatibility

Canonical triage roles may use `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. The execution lifecycle additionally uses `claimed` and `resolved`. If the Matt `triage` skill is installed later, `docs/agents/triage-labels.md` may map those canonical triage roles without changing this storage convention.

## External request surfaces

External pull requests are not an Issue request surface by default.
