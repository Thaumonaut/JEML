# jotl

JOTL — a markup language for UI templating that compiles to HTML.

```bash
npm install -g jotl
```

This installs the `jotl` command on your PATH.

## Quick start

Save a file as `hello.jot`:

```jotl
>> meta [
  title="Hello"
]

>> document:
  > heading.1: Hello, world <
  > text:
    A page that looks intentional with **zero CSS**.
  <
<< document
```

Compile it:

```bash
jotl compile hello.jot -o hello.html   # one-shot compile
jotl watch . -o build/                  # recompile on every save
jotl serve hello.jot --port 4321       # dev server with live reload
```

`jotl serve` runs as plain HTML (no iframe, no framework) with linked
`/__jotl/runtime.js`, `/__jotl/styles.css`, and a 12-line live-reload script.

## Default styles

Every JOTL document is rendered with a small **preset stylesheet** baked in
(~9&nbsp;KB inlined, no external requests). The foundation is
[new.css](https://newcss.net/) by Xz (MIT, vendored), which classlessly
styles raw HTML elements with a centered 750&nbsp;px content rail. On top
we layer a thin JOTL primitives layer for the structural classes the
compiler emits — `.jotl-grid`, `.jotl-stack`, `.jotl-group`, `.jotl-card`.
Light and dark mode come for free via `prefers-color-scheme`.

Re-skin the document by overriding any `--jotl-*` token:

```jotl
>> style: {
  :root {
    --jotl-lk-1: #ff6f3c;        /* primary buttons & links */
    --jotl-bg-1: #fafafa;        /* page background */
    --jotl-radius: 12px;         /* friendlier corners */
  }
}
```

To opt out of the preset entirely (for example, to bring your own design
system), add `>> style [preset=none]` to the document. The preset CSS file
ships in this package at `styles/jotl.css` — fork it and link your fork.

See [`styles/README.md`](./styles/README.md) for the full token reference
and credits.

## Language reference

- [`spec/RULEBOOK.md`](https://github.com/Thaumonaut/jotl-project/blob/main/spec/RULEBOOK.md) — authoritative language specification
- [`spec/ELEMENT_MAPPING.md`](https://github.com/Thaumonaut/jotl-project/blob/main/spec/ELEMENT_MAPPING.md) — JOTL → HTML compilation table
- [`docs/index.html`](https://thaumonaut.github.io/jotl-project/) — illustrated tutorial

## Editor support

The companion VS Code / Cursor extension is published as `jotl-language` on
the marketplace. It provides syntax highlighting (including embedded
TypeScript and CSS in `>> script` and `>> style` blocks) and an LSP-backed
diagnostics + completion experience.

## License

MIT
