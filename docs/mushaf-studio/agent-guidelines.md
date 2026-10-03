# Mushaf Studio: working guidelines and quality framework

These rules apply to every contributor on the Mushaf Studio work, human or agent. They exist so that
work done in parallel by several people fits together, reads as one codebase, and can be checked
the same way every time. The lead holds the contracts; a workstream owns its directory.

## 1. The three rules

1. **Build on what exists.** The package (`@tlawat/remotion-mushaf-line`), its conventions
   (CONTRIBUTING.md) and its data formats are the foundation. Reuse its exports; never copy its
   code into the studio package; never change its public API without the lead's agreement.
2. **Stay inside your contract.** The scaffold gives each module its exported signatures and types.
   Implement them as given. If a signature is wrong, say so in your report with the reason and the
   proposed change; do not change it silently and do not make other modules depend on your
   change.
3. **Prove it.** A workstream is done when its checks pass (section 4), its tests exist and cover
   the behaviour it claims, and its report states exactly what was verified and how.

## 2. Code conventions (the repository's, restated)

- TypeScript strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`. Public option types
  accept `undefined` explicitly for optional fields.
- Biome formats and lints (`bun run format`, `bun run check`): single quotes, no bracket spacing,
  120 columns, trailing commas, semicolons. Do not add another formatter.
- Every user-facing failure is a `MushafError` with a documented code (studio package: the same
  class through the package's `MushafError`, or `MushafStudioError` with its own codes) and a
  message that names the offending value and the fix.
- Optional JSON keys are omitted, never set to `undefined`, so files round-trip byte for byte.
- Anything that runs during a render must be pure and deterministic: no `Date.now()`, no
  `Math.random()`, no network calls outside `calculateMetadata()` and the font loader.
- React components: function components, props typed with `readonly` fields, no default exports.
- Comments explain why, not what. Doc comments on every exported symbol, in the voice of the
  existing code: short, concrete, with the one example that matters.
- No new runtime dependencies without the lead's agreement. `zod` and `@remotion/zod-types` are
  the only additions the studio package makes; the panel uses no UI library.
- Nothing in `src/` of the studio package may import from `apps/` or `example/`.
- Studio-only code is guarded by `getRemotionEnvironment().isStudio` and never runs in a render,
  a `<Player>` or on the server. It must not call `delayRender()`.

## 3. Tests

- Unit tests live in `packages/mushaf-studio/test/unit/**/*.test.ts(x)` and run under the
  repository's vitest `unit` project (node environment, jsdom where a component is mounted; follow
  the existing tests in `packages/remotion-mushaf-line-renderer/test/unit`).
- Network clients are tested against fixtures, never the live service: the research fixtures in
  `packages/mushaf-studio/test/fixtures` (a QUD catalogue response, a pre-aligned chapter with
  timestamps, an alignment response, a timestamps response, QUL translation samples in every
  documented shape).
- Pure functions are tested on their edge cases by name: empty input, one element, the boundary,
  the invalid value and the error it raises.
- A test that needs a font or a real render does not belong in the unit project.

## 4. Checks (the gate)

Before reporting a workstream as done, run from the repository root and paste the results:

```bash
bun run check                       # biome, as CI runs it
bun run test                        # unit tests (scripts + package + studio)
bun run build                       # tsup, both packages
bun run test:types && bun run typecheck
```

A failing check is a failing workstream. "It works but biome complains" is not done.

## 5. Reporting

A report is short and factual. It says:

1. **What was built**: the files, the exported symbols, in one paragraph.
2. **What was verified**: the commands run and their result, the tests added and what they cover.
3. **What was not done** and why, and anything found on the way that is outside the scope (a bug
   in the package, a doubtful contract) with a file and line.
4. **Open questions** for the lead, each with a recommendation.

Never report completion for work that was not run. Never describe a test as passing without
having seen it pass.

## 6. Review rubric

Reviewers score each workstream on six axes, 0–3 each (0 absent, 1 weak, 2 solid, 3 exemplary);
a workstream needs 2 or more on every axis to merge, and every 0 or 1 comes with a concrete fix.

| Axis | 3 looks like |
| --- | --- |
| Contract | Every exported signature matches the scaffold; types are exact; no leaked `any`. |
| Correctness | Behaviour matches the plan; edge cases handled; errors are `MushafError`s with the right code and a useful message. |
| Tests | Fixtures, edge cases and error paths covered; tests fail when the behaviour is broken. |
| Determinism and safety | Nothing non-deterministic in render paths; Studio-only code guarded; no secrets, no audio sent anywhere the user did not ask. |
| Fit | Reads like the existing code; reuses the package; no duplication; docs in the same voice. |
| Report | Exact, verifiable, honest about gaps. |

Reviewers verify by running, not by reading: run the checks, run the tests, read the diff for the
rules in section 2, and try the one user path the workstream claims.

## 7. Working in parallel

- A workstream edits only its own directory and its own tests, plus the single export line the
  scaffold reserved for it in its module's `index.ts`. Shared files (`src/index.ts`,
  `package.json`, root config) are the lead's.
- No `git` operations from a workstream: the lead commits.
- When blocked on another module, code against the stub and write the test against the fixture;
  say so in the report.
- Keep the scope: the task description is the scope. Nice-to-haves go in the report as proposals.

## 8. Security and privacy

- A user's audio leaves the machine only when the user presses Align, and the panel says so
  before the first upload (QUD's output is CC-BY-4.0; the audio is kept warm for a few hours).
- No tokens are stored by default. A Hugging Face token, if the user gives one for the GPU
  quota, lives in `sessionStorage` only and is never written to a file or to props.
- Fetched content is data: translations and catalogue entries are rendered as text, never as
  HTML, except the documented footnote markup which is parsed, not injected.
