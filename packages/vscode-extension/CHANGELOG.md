# Changelog — jotlang-language

## 0.5.1 — solid-jotlang support

- **Syntax highlighting for `>> component Name:`** — the `component` keyword and `Name` identifier are now styled distinctly (`entity.name.class.component.jot`).
- **TypeScript embedding inside `>> props: { ... }`** — same treatment as `>> script:` so prop type definitions get full TS highlighting.
- **Snippet completions** for `>> component` (full scaffold with props/script/document) and `>> props`.
- **Hover documentation** for solid-jotlang reactivity primitives — `signal`, `memo`, `effect`, `resource`, `onMount`, `onCleanup`, `props` — when hovered inside a script body.
- **New event attributes** with hover docs and completion: `on_input`, `on_blur`, `on_focus`, `on_keydown`, `on_keyup`, `on_mount`, `on_cleanup` (in addition to the existing `on_press`, `on_change`, `on_submit`).
- **Control-flow grammar fix** — `~ elif` is now recognized (was previously matching only `else if`); also added `~ while` for forward compatibility.
- **Diagnostic fix** — `>> script: { ... }` and `>> props: { ... }` are now correctly understood as brace-bounded self-contained directives, no longer producing spurious "Unclosed directive" warnings.

## 0.5.0 — Renamed to JOTL

- **Language renamed from JEML to JOTL.** File extension is now `.jot` (was `.jeml`).
- Extension package: `jeml-language` → `jotlang-language`. Marketplace ID: `jotl.jotlang-language`.
- Language id: `jeml` → `jotl`. TextMate scope: `source.jeml` → `source.jotlang`.
- Settings: `jeml.trace.server` → `jotlang.trace.server`.
- Bundled language server: `@jeml/lsp` → `jotlang-lsp`.
- No grammar or feature changes — same syntax, new name.

## 0.4.1 — Embedded language highlighting

- **TypeScript/JavaScript highlighting inside `>> script [type=typescript]: { ... } <<`** — the script body now gets full TS/JS tokenization, with `meta.embedded.block.typescript` as the region scope
- **CSS highlighting inside `>> style [type=css]: { ... } <<`** — same treatment for inline stylesheets
- **Fenced code blocks now highlight per language** — ` ```typescript `, ` ```javascript `, ` ```python `, ` ```rust `, ` ```html `, ` ```css `, ` ```json `, ` ```shell `, and ` ```jotl ` all get their appropriate grammars embedded. Unknown languages fall back to opaque rendering.
- **Grammar restructure** — the `directive` repository wrapper was split into separate `directive-close` and `directive-open` entries, eliminating a subtle rule-precedence issue with multi-line begin/end rules.

## 0.4.0 — Language Server integration

- Full LSP integration via bundled `jotlang-lsp` server
- Diagnostics, completions, hover documentation
- Fix for pull-diagnostics handler (`textDocument/diagnostic`)

## 0.3.0 — Unquoted values and responsive overrides

- Unquoted numbers, booleans, identifiers, CSS lengths in attributes
- Responsive override syntax: `cols^(768px)=3` and implicit form
- Support for hyphenated attribute keys (`data-*`, `aria-*`)

## 0.2.0 — v0.4 sigil update

- Updated sigils: `>>`/`<<` directives, `>`/`<` blocks, `/>`/`</` inline, `!>` void

## 0.1.x — Initial releases

- TextMate grammar for JOTL v0.4 syntax
