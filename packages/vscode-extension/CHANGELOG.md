# Changelog — jeml-language

## 0.4.1 — Embedded language highlighting

- **TypeScript/JavaScript highlighting inside `>> script [type=typescript]: { ... } <<`** — the script body now gets full TS/JS tokenization, with `meta.embedded.block.typescript` as the region scope
- **CSS highlighting inside `>> style [type=css]: { ... } <<`** — same treatment for inline stylesheets
- **Fenced code blocks now highlight per language** — ` ```typescript `, ` ```javascript `, ` ```python `, ` ```rust `, ` ```html `, ` ```css `, ` ```json `, ` ```shell `, and ` ```jeml ` all get their appropriate grammars embedded. Unknown languages fall back to opaque rendering.
- **Grammar restructure** — the `directive` repository wrapper was split into separate `directive-close` and `directive-open` entries, eliminating a subtle rule-precedence issue with multi-line begin/end rules.

## 0.4.0 — Language Server integration

- Full LSP integration via bundled `@jeml/lsp` server
- Diagnostics, completions, hover documentation
- Fix for pull-diagnostics handler (`textDocument/diagnostic`)

## 0.3.0 — Unquoted values and responsive overrides

- Unquoted numbers, booleans, identifiers, CSS lengths in attributes
- Responsive override syntax: `cols^(768px)=3` and implicit form
- Support for hyphenated attribute keys (`data-*`, `aria-*`)

## 0.2.0 — v0.4 sigil update

- Updated sigils: `>>`/`<<` directives, `>`/`<` blocks, `/>`/`</` inline, `!>` void

## 0.1.x — Initial releases

- TextMate grammar for JEML v0.4 syntax
