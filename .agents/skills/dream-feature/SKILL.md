---
model: opus
created: 2026-05-13
modified: 2026-05-13
reviewed: 2026-05-13
name: dream-feature
description: |
  High-level feature planning and milestone orchestration. Use when the developer
  wants to scope a broad feature, user story, or initiative. Produces a GitHub
  milestone and a set of linked sub-issues via sub-agents.
allowed-tools: Bash, Read, WebFetch, invoke_agent
---

# Dream Feature

**Mode: architecture & planning. This session produces a GitHub milestone and
multiple sub-issues. No code changes, no file edits, no commits.**

## Flow

### 1. Orient & Elicit

Ask the user:
> What is the high-level vision for this feature or initiative?

Use the answer to identify core domains. Read `.agents/skills/github-pr/SKILL.md`
for general conventions. Do not load specific technical skills yet; this phase
is about breadth, not depth.

### 2. Plan (The "Dream" Phase)

Use `enter_plan_mode` to draft a breakdown of the feature into 3–7 logical
sub-tasks or "specs". For each sub-task, define:
- **Title**: A clear, action-oriented name.
- **Goal**: A one-sentence summary of what it achieves.
- **Dependencies**: Any other sub-tasks it depends on.

### 3. Review & Discuss Milestone

Present the proposed Milestone structure to the user:

```markdown
## Milestone: <Title>
<High-level description and value proposition>

## Proposed Sub-Issues
- [ ] <Sub-task 1 Title>: <Goal>
- [ ] <Sub-task 2 Title>: <Goal>
...
```

After presenting the proposal, ask:
> Does this roadmap feel right, or should we discuss and adjust the scope?

Enter a conversational phase. Answer questions about the breakdown, discuss
dependencies, and gather feedback **without re-generating the entire milestone
body** until the user is satisfied.

Once the user approves the refined plan, present the **Final Milestone Draft**.

### 4. Create Milestone

Once the final draft is confirmed, create the milestone:

```bash
gh milestone create \
  --title "<Title>" \
  --description "<Description>\n\n## Sub-Issues\n- [ ] <Sub-task 1 Title>\n- [ ] <Sub-task 2 Title>"
```

**Capture the milestone number** from the command output (e.g., "created milestone #5").

### 5. Spawn Specs (Execution)

For each approved sub-task, invoke a sub-agent (prefer `codebase_investigator`
for complex ones, `generalist` for simple chores) to author the specific spec.

**Sub-agent Prompt Template:**
> Use the `spec-issue` skill to author a GitHub issue for: "<Sub-task Title>".
>
> **Milestone Context:**
> <Insert the full Milestone description and the complete breakdown from Step 2>
>
> **Goal:** <Sub-task Goal>
> **Dependencies:** <List of Sub-task Titles this depends on>
> **Constraints:** Associate the issue with milestone title "<Milestone Title>"
> (pass as `--milestone "<Milestone Title>"` — passing the numeric ID fails).
>
> **Instruction:** You are acting as a sub-agent for a `/dream` orchestration.
> Use the provided Milestone Context to answer any internal questions or
> technical trade-offs during the `spec-issue` "Discuss & Refine" phase.
> Resolve the discussion autonomously using the vision established in the
> milestone.
>
> **Permission handling:** If you need Bash or Write permission to file the
> issue, include the **complete final issue body** verbatim in your permission
> request so the orchestrator can act on it without losing context.
>
> **Output:** Return ONLY the URL of the created issue.

**Orchestrator permission handling (critical):**

When a sub-agent halts requesting Bash or Write permission, **always use
`SendMessage` to the original agent ID** to grant permission and resume it —
never spawn a fresh agent. A fresh agent has no memory of the issue body and
will hallucinate unrelated content by latching onto visible repo issues.

If `SendMessage` is unavailable, extract the complete issue body from the
agent's permission-request message and create the issue directly via Bash
rather than delegating to a new context-free agent.

### 6. Link and Finalize

Collect all created issue URLs and numbers. Update the milestone description to
replace the checkboxes with links to the created issues.

```bash
gh milestone edit <Milestone Number> \
  --description "<Description>\n\n## Sub-Issues\n- [x] [<Sub-task 1 Title>](<Issue URL 1>)\n- [x] [<Sub-task 2 Title>](<Issue URL 2>)"
```

### 7. Cross-Reference Dependencies

If any sub-tasks had dependencies defined in Step 2, update those issues to
reference their requirements.

For each issue that has a dependency:
```bash
gh issue edit <Issue Number> --body "$(gh issue view <Issue Number> --json body --template '{{.body}}')\n\n### Dependencies\n- [ ] <Dependency Issue URL>"
```

Report the final milestone URL and a summary of the dependency graph to the user.
