# JOTL Project — Claude Code Kickoff (v0.4)

## What this project is

JOTL (JOTL) is a markup language designed to replace HTML, XML, and JSON for UI and templating. It compiles to HTML (v1 target). It is a single-file component format like Svelte or Vue.

The language spec is in `spec/RULEBOOK.md`. Read it completely before writing any code — it is the source of truth.

## Project goals

- **v1 target:** HTML. Nothing else.
- **Extensibility:** architecture must make it possible for others to add script-language targets (Python, Rust, Dart) without modifying core parsing or HTML codegen.
- **Open source:** MIT-licensed.

## ⚠️ Critical syntax rules — JOTL v0.4

### Four structural sigil pairs

Every structural element uses ONE of these sigils:

```
>> directive <<          % document-scope directives: meta, style, import, script, document
> block <                % block elements: sections, headings, text, buttons, etc.
/> inline </             % inline elements: spans, badges, icons-in-text, emphasis
!> void                  % void elements: images, fields, breaks — no body, no closer
```

The `|>` and `<|` sigils are **reserved for future use** — do not generate them.

### Mandatory content delimiter `:`

Every element with content uses `:` to separate the tag declaration from the content:

```
> heading.1: Hello <                   % single-line content
> section [id="hero"]:                 % multi-line content
  ...
< section
```

An opening `>` or `/>` or `>>` without `:` is a parse error (unless it has no content at all, in which case see empty elements).

### Empty elements

- **Empty blocks:** two-line form with `:` still required:
  ```
  > placeholder:
  <
  ```
- **Empty inline:** single-line with `:` still required:
  ```
  /> icon [name="star"]: </
  ```
- **Void elements:** use `!>`, no `:`, no closer:
  ```
  !> image [src="/logo.svg"]
  !> break
  ```

### Variants via `.`

Enumerated variants attach to tag names with a dot:

```
> heading.1: Title <           % H1
> heading.2: Subtitle <        % H2
> button.primary: Go <         % primary button
> button.primary.lg: Go <      % primary, large
> card.elevated: ... <         % elevated card
> list.number:                 % ordered list
  - One
<
```

Each tag has a fixed list of allowed variants (see RULEBOOK §7.5 and ELEMENT_MAPPING.md). Undefined variants are errors.

### Reference sigils

Three distinct sigils for three kinds of references:

```
&variable       % value reference from >> script
@handler        % function reference from >> script
$iterator       % loop-bound iterator inside ~ for
```

These are not interchangeable. Using the wrong one is a compile error.

### Other sigils

- `-` — sibling item marker (list items, table cells, nav items)
- `#'text'[url="..."]` — link shorthand
- `**bold**`, `_italic_`, `` `code` `` — Markdown inline sigils
- ` ``` ` — fenced code blocks
- `%` — line comment, `%{ %}` — block comment
- `~ for`, `~ if`, `~ else`, `~<` — control flow
- `{expression}` — inline expression wrapper
- `^(breakpoint)=value` — responsive attribute override (see RULEBOOK §8.6)

### Unquoted attribute values

Attribute values can appear unquoted when the content is unambiguous:
- Numbers: `cols=3`, `rows=1.5`
- Booleans: `active=true`, `hidden=false`
- Identifiers: `type=email`, `style=primary`, `layout=row` (bare identifiers are string literals, never variable references)
- CSS lengths: `size=4rem`, `gap=16px`

Anything with spaces, special characters, or punctuation still requires quotes. See RULEBOOK §8.3 for the full value grammar.

### Responsive overrides

Layout attributes accept mobile-first responsive overrides:

```
> grid [cols=1 ^(500px)=2 ^(1024px)=4 gap=sm ^(768px)=md]:
```

Two binding forms: explicit (`cols^(768px)=3`) and implicit (`^(768px)=3` binds to the most recent base attribute). Only layout attributes (§8.7) accept overrides meaningfully — style attributes compile with a warning. Not required for milestone 1 (see below).

## First milestone

**A minimal JOTL → HTML compiler for the STATIC subset only, with a browser playground.**

Static subset includes:
- `>> meta` directives (rendered into `<head>`)
- `>> style` directives (inline CSS or `ref` to external file)
- `>> document` directive containing markup
- Block elements with `:` delimiter
- Inline elements with `/>` `</`
- Void elements with `!>`
- Named closers `< tagname`, `<< tagname`
- Tag variants (`.primary`, `.1`, etc.)
- Attributes (quoted and unquoted values)
- `-` sibling markers
- Markdown sigils
- Fenced code blocks
- Link shorthand
- Comments
- Escape sequences

Explicitly OUT of scope for this milestone:
- `>> script` directive
- `&variable`, `@handler`, `$iterator` references (static rendering only)
- `{expression}` wrappers
- `~ for`, `~ if`, `~ else` control flow
- Ternaries
- `>> import` and `>> export`
- **Responsive overrides and CSS generation** (defer to milestone 2)

The parser SHOULD still accept responsive override syntax without error — just ignore the overrides during HTML emission. A warning is acceptable. Milestone 2 adds the CSS codegen pass that turns those overrides into media queries.

References in examples during this phase render as literal text (`&user.name` → the text `&user.name`).

## Tech stack

- **Language:** TypeScript strict
- **Parser generator:** Peggy (`npm install peggy`). Grammar in `src/grammar/jotl.pegjs`.
- **Runtime:** Node 20+ for the compiler, vanilla browser for the playground.
- **Testing:** Vitest. Snapshot tests against `tests/expected/`.
- **Playground:** Vite + vanilla TS.

## Repository structure

```
jotl/
├── src/
│   ├── grammar/
│   │   └── jotl.pegjs
│   ├── parser/
│   │   ├── parser.ts
│   │   └── ast.ts
│   ├── compiler/
│   │   ├── index.ts
│   │   ├── html-codegen.ts
│   │   └── targets/
│   │       └── typescript/
│   │           └── .gitkeep
│   ├── playground/
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── style.css
│   └── index.ts
├── tests/
│   ├── examples/
│   ├── expected/
│   └── compiler.test.ts
├── spec/
│   ├── RULEBOOK.md
│   └── ELEMENT_MAPPING.md
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Work sequence

1. **Read the rulebook first.** `spec/RULEBOOK.md`.
2. **Read the element mapping.** `spec/ELEMENT_MAPPING.md`.
3. **Read the test corpus.** `tests/examples/` paired with `tests/expected/`.
4. **Write the Peggy grammar.** Parse every test example without error.
5. **Write the AST transformer.** Parse tree → semantic AST.
6. **Write the HTML codegen.** AST → HTML strings. Make tests pass.
7. **Write the playground.** Textarea, render pane, AST tree view.

## Self-validation loop

After each change:
1. `npm run test` — all tests must pass
2. `npm run typecheck` — no type errors
3. For new features: add paired `examples/NN-feature.jot` + `expected/NN-feature.html` first

## When to stop and ask

Stop and surface a question instead of guessing when:
- A grammar ambiguity the rulebook doesn't resolve
- An example contradicts the rulebook
- A new sigil or syntax decision is needed
- A rule seems wrong and should change

Do NOT stop for:
- Implementation approach
- Error message wording
- Edge cases already covered by tests

## Success criteria for this milestone

- `npm run test` passes (excluding test 13, which is the responsive milestone-2 example)
- `npm run dev` launches the playground
- Pasting `tests/examples/12-full-landing.jot` produces `tests/expected/12-full-landing.html`, with responsive overrides ignored or stripped cleanly
- README has "Getting started" enabling another developer to run the playground in <5 min
- `src/compiler/targets/typescript/` exists as extension point

## Later milestones (not for now)

**Milestone 2 — Responsive & CSS codegen:**
- CSS codegen pass that reads responsive overrides from the AST and emits `<style>` blocks with CSS custom properties + media queries
- `data-jotl-r` anchor attribute generation for responsive elements
- Test 13 (`13-responsive.jot`) becomes the acceptance test for this milestone
- Test 12 gains its `<style>` block for the responsive grids

**Milestone 3+ — Reactivity and dynamic content:**
- Reference resolution (`&`, `@`, `$`) with static values
- Reactivity (Svelte-style `let`)
- Control flow (`~ for`, `~ if`)
- Handlers
- Component system (`>> import`, `>> export`)

### Milestone 3 status (in progress)

The compiler now parses `>> script`, `>> import`, `~ if`, `~ for`, and the
`&`/`@`/`$`/`{…}` reference sigils. For files that use any of these, the
emitted HTML includes `data-jotl-*` markers and a `<script>` tag carrying a
~3 KB client runtime plus the transpiled `>> script` body.

- State (`let name = …`) is reactive via a `Proxy`; writes schedule a render.
- Handlers (`name () { … }`) become `handlers.name` and wire through
  `data-jotl-on-EVENT` attributes (`on_press` maps to `click`).
- `~ if` / `~ for` emit `<template>`-based containers that the runtime
  stamps into the DOM with a loop scope (`$scope.item`, `$scope.index`).
- `>> import` is parsed but cross-file resolution is not yet implemented;
  `.jot` imports emit a commented skip marker in the output script.

See `src/compiler/targets/typescript/transpile.ts` for the script transform
(the JOTL script body is **not** valid JS on its own) and
`src/runtime/embed.ts` for the runtime text that gets inlined.
