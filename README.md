# JEML

**Jacob's Easy Markup Language** — a new markup language designed to replace HTML, XML, and parts of JSON for UI and templating.

This repository contains the reference implementation (TypeScript) of the JEML compiler, plus a browser playground.

## Status

v1 is in initial implementation. The static subset (markup, attributes, Markdown sigils, links, comments) is the current milestone. Reactivity, control flow, and components come later.

## For AI agents working on this project

**Start here:** Read `KICKOFF.md` in the project root. It contains the full onboarding brief — what to build, how to structure the code, what success looks like.

After reading `KICKOFF.md`, read these three files in order:

1. `spec/RULEBOOK.md` — the language specification. Source of truth for syntax.
2. `spec/ELEMENT_MAPPING.md` — how JEML tags compile to HTML elements. Source of truth for the compiler's output.
3. `tests/examples/` and `tests/expected/` — 12 paired JEML + HTML files that define correct behavior by example.

## For humans

### Quick start

```bash
npm install
npm run test       # runs the compiler test suite
npm run dev        # launches the playground at localhost:5173
```

### Project layout

```
src/
  grammar/      Peggy grammar file (jeml.pegjs)
  parser/       AST types and parser wrapper
  compiler/     AST → HTML codegen
    targets/typescript/   Reserved for future script-section work
  playground/   Browser playground (Vite)
spec/
  RULEBOOK.md        Language specification
  ELEMENT_MAPPING.md Compiler's JEML → HTML mapping
tests/
  examples/     JEML input files
  expected/     Corresponding HTML output files
  compiler.test.ts   Snapshot tests
```

## Contributing

JEML is designed to eventually support script sections written in multiple languages (TypeScript, Python, Rust, Dart). The current implementation only handles TypeScript and static-subset markup. The `src/compiler/targets/typescript/` folder is the designated extension point for alternative script languages.

When adding a new feature, always add a paired `tests/examples/NN-feature.jeml` and `tests/expected/NN-feature.html` file before implementing. Tests are the specification.
