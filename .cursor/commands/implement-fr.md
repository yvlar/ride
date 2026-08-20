# Implement one functional requirement

Implement exactly one functional requirement from the Ride MVP specification and publish it as a pull request.

The text following `/implement-fr` is the command input. It must contain exactly one requirement ID in the form `FR-xxx`, for example:

```text
/implement-fr FR-001
```

If the input is missing, contains more than one FR, or does not match `^FR-[0-9]{3}$` (case-insensitive), stop and ask for one valid ID. Canonicalize the ID to uppercase. Never infer the next FR.

## Non-negotiable outcome

- Work only on the target FR and the BR/NFR requirements strictly needed for it.
- Do not implement another FR unless it is an unavoidable prerequisite explicitly documented in the specification. If that would materially expand the scope, stop and request a separate decision instead of implementing it silently.
- Do not merge the pull request.
- After creating the pull request, report the result and stop. Do not inspect, plan, or start the next FR.

## 1. Establish the source of truth

Before changing anything:

1. Read `AGENTS.md` and all applicable files under `.cursor/rules/`.
2. Read the target FR in `docs/specs/ride-mvp-spec.md`, plus every section it references and every section that references it.
3. Read the relevant technical sections of `CURSOR.md`, the applicable repository documentation, and the existing code and tests.
4. Treat `docs/specs/ride-mvp-spec.md` as authoritative for MVP product behavior. Treat `CURSOR.md` as the technical guide. If they conflict on product scope, follow the MVP specification and record the conflict; do not silently implement the broader behavior.
5. Identify associated requirements using explicit cross-references and actual applicability, not keyword proximity alone.

Create a requirement map before implementation:

- target FR;
- directly associated FRs that are prerequisites or acceptance surfaces;
- applicable BRs;
- applicable NFRs;
- acceptance evidence required for each item;
- known ambiguities, conflicts, or decisions that require user input.

If the target FR does not exist, is ambiguous, contradicts the specification, or requires an unresolved product/provider decision, stop with evidence and a concise question. Do not guess.

## 2. Protect the worktree and branch

1. Determine the repository's default branch from Git/GitHub; do not assume its name.
2. Inspect `git status`, the current branch, remotes, and any existing pull request for the target branch.
3. Do not discard, overwrite, stage, or include unrelated user changes. If the worktree is not clean and the changes are not clearly part of this FR, stop and report the exact paths.
4. Fetch the default branch and start from its current remote tip.
5. Use the branch name `feature/<FR-ID>`, preserving the canonical uppercase ID, for example `feature/FR-001`.
6. If that branch or a matching pull request already exists, inspect it. Resume it only when it clearly belongs to the same FR and doing so is safe; otherwise stop rather than overwrite history or create a duplicate PR.
7. Never force-push.

## 3. Plan the smallest compliant change

Inspect the current implementation and tests, including partial work. Produce a short plan that names:

- the gap between the requirement map and current behavior;
- files likely to change;
- tests and validation commands;
- risks and assumptions;
- explicit out-of-scope items.

Prefer the smallest implementation that fully satisfies the mapped requirements. Preserve the existing architecture and keep domain rules independent from UI, infrastructure, persistence, and named map/routing providers. Do not perform unrelated refactors or dependency upgrades.

## 4. Implement and test

Implement only the approved scope. Add or update tests that demonstrate the mapped acceptance evidence and include requirement IDs in test names or nearby descriptions where practical.

Discover commands from `package.json`, repository documentation, and CI rather than relying only on this prompt. Run the narrowest relevant checks while developing, then run the complete repository validation set before review. For the current repository, that normally includes:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

If a command is unavailable, explain why and use the closest repository-supported equivalent. Do not claim a validation ran when it did not. Do not weaken, skip, or delete tests merely to make validation pass.

## 5. Review and correction loop

After the complete validation set passes:

1. Check whether a `/code-review` project command or equivalent registered command is available.
2. If Cursor can invoke it from the current execution, invoke it on the complete diff against the default branch. If nested invocation is unavailable but its project command file exists, read that file and follow its review workflow.
3. Otherwise perform an equivalent structured review of the complete diff.

The structured fallback must review:

- conformance to every item in the requirement map;
- correctness, edge cases, error states, and regressions;
- architecture and provider independence;
- security, privacy, secret exposure, and sensitive logging;
- tests and missing acceptance evidence;
- accessibility/mobile behavior when UI is affected;
- performance and operational failure modes when relevant;
- accidental out-of-scope changes.

Classify findings as `blocker`, `high`, `medium`, or `low`, with file/line evidence and a concrete reason. Validate each finding against the code and specification before changing anything. Record false positives with a short rationale; do not churn the code to satisfy invalid findings.

For every valid important finding (`blocker`, `high`, or `medium`):

1. fix the smallest root cause;
2. rerun the relevant focused checks;
3. rerun the complete validation set;
4. rerun review on the complete updated diff.

Repeat until there are no valid important findings and all complete validations pass.

Maintain a compact loop ledger containing the cycle number, validation failure signatures, review finding signatures, attempted fix, and resulting state. Treat the loop as repetitive when any of these occurs:

- the same normalized failure or finding remains after two distinct fix attempts without new diagnostic evidence;
- states oscillate between the same two failure sets twice;
- five correction/review cycles complete without convergence.

On repetitive-loop detection, stop before commit, push, or PR creation. Report a root-cause analysis with evidence, attempted fixes, why they failed or oscillated, remaining risk, and the smallest decision or external change needed to proceed. Do not keep applying speculative edits.

## 6. Final compliance and publication gates

Before staging anything:

1. Re-read the target FR and mapped BR/NFR sections.
2. Produce a final traceability check from each requirement to implementation and test evidence.
3. Confirm no unrelated FR or out-of-MVP behavior was introduced.
4. Run the complete validation set once more if anything changed after the last full run.
5. Inspect the full diff and run `git diff --check`.
6. Inspect `git status` and verify that only intended files will be included.
7. Check changed files and staged content for secrets, credentials, private keys, tokens, sensitive logs, and accidentally committed environment files. Use the repository's secret scanner when one is configured. Never print a discovered secret; report only its path and type, then stop publication until it is removed safely.

Stage only the intended paths explicitly. Review the staged diff, then create one focused commit whose message includes the FR ID.

Push `feature/<FR-ID>` to the configured remote without force. Determine the exact default base branch and repository, check again for an existing matching PR, then open exactly one pull request. The PR must include:

- the target FR and associated BR/NFR IDs;
- a concise implementation summary;
- requirement-to-test evidence;
- validation commands and outcomes;
- risks, limitations, and any non-blocking follow-up;
- confirmation that no other FR was intentionally implemented.

Do not merge, auto-merge, or enable automatic merging.

## 7. Mandatory stop

After the pull request is created, output only the useful handoff summary: branch, commit, PR link, mapped requirements, validations, and any remaining non-blocking note. Then **STOP**. Do not select, analyze, or begin another requirement, even if the next FR appears obvious.
