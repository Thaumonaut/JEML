# JEML

**Jacob’s Easy Markup Language** — a markup language for people who like writing UI by hand but want something shorter and more regular than HTML.

JEML is a **single-file component** format (think Svelte or Vue SFC, but markup-first). One file can hold metadata, linked styles, and your page tree. The reference compiler in this repo turns that into **real HTML** you can open in a browser or ship anywhere static HTML goes.

---

## Why bother?

- **Three structural “flavors”** instead of one overloaded `<tag>` syntax: blocks (`>` … `<`), inlines (`/>` … `</`), and voids (`!>` … nothing). You can see what kind of thing you’re reading without checking the spec.
- **Variants** on tags (`heading.2`, `button.primary.lg`, `list.number`) so common UI patterns stay compact.
- **Readable attributes** in `[brackets]`, including unquoted identifiers and numbers when that’s enough.
- **Responsive overrides** next to the attribute they affect (`cols=1 ^(768px)=2`) — layout intent stays local (full responsive story is evolving; see specs and tests).

If that sounds opinionated, it is — JEML is trying to be **pleasant to read and teach**, not to be a second HTML with different angle brackets.

---

## See it in 30 seconds

```jeml
>> meta [
  title="Hello"
  description="A tiny page"
]

>> document:
  > heading.1: Hello, world <
<< document
```

The compiler emits a full document: `<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`, and your content.

---

## Install the CLI (use JEML anywhere)

Pick **standalone binaries** (no Node.js) or **npm** (needs Node 18+).

### Standalone binaries (Linux, macOS, Windows)

Each [GitHub Release](https://github.com/Thaumonaut/jeml-project/releases) includes executables built by CI when a maintainer pushes a **version tag** (for example `v0.1.0`). Checksums are in **`SHA256SUMS.txt`** on that release.

| Asset | Use on |
|--------|--------|
| `jeml-linux-x64` | Linux x86_64 |
| `jeml-linux-arm64` | Linux ARM64 (many cloud VMs, Raspberry Pi 4+, etc.) |
| `jeml-darwin-arm64` | macOS Apple Silicon |
| `jeml-darwin-x64` | macOS Intel |
| `jeml-windows-x64.exe` | Windows 10/11 x64 |

**macOS / Linux:** after download, `chmod +x jeml-<name>` (use the real filename), then `./jeml-linux-x64 --help` (adjust for your asset).

**Windows:** run `jeml-windows-x64.exe` from PowerShell or Explorer, or put it on your `PATH`. Binaries are not code-signed yet; SmartScreen may prompt the first time you run the `.exe`.

**Try the workflow without a release:** open **Actions → Release binaries → Run workflow**; completed runs list **artifacts** you can download (same filenames, no GitHub Release page).

**Build one binary locally** (requires [Bun](https://bun.sh) and `npm ci`):

```bash
bun build --compile --target=bun-darwin-arm64 ./src/cli.ts --outfile jeml
```

Change `--target` to `bun-linux-x64`, `bun-darwin-x64`, `bun-windows-x64`, etc. ([Bun cross-compile docs](https://bun.sh/docs/bundler/executables#cross-compile-to-other-platforms)).

---

### From GitHub (no npm account required)

You need **Node 18+**.

```bash
npm install -g github:Thaumonaut/jeml-project
jeml --help
jeml compile my-page.jeml -o my-page.html
jeml serve my-page.jeml --open
```

The first command clones the repo, installs dependencies, runs **`prepare`** to build `dist/jeml.mjs`, and links the **`jeml`** binary globally. Use a **fork’s** `user/repo` if you work from your own remote.

### From a local clone (contributors)

```bash
git clone https://github.com/Thaumonaut/jeml-project.git
cd jeml-project
npm install          # runs prepare → builds the CLI automatically
npm link             # puts `jeml` on your PATH from this checkout
jeml --help
```

### From npm (after the package is published)

```bash
npm install -g jeml
# or, without a global install:
npx jeml compile my-page.jeml -o my-page.html
```

Publishing is a one-time `npm publish` from a maintainer machine (see [Creating & publishing packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages)). If the name `jeml` is already taken on the registry, switch to a **scoped** name in `package.json` (for example `@your-scope/jeml`) and document that install string instead.

**Note:** Installing **only** production deps from a git checkout (`npm install --omit=dev`) skips `esbuild`, so the `prepare` build will not run—use the default install for global git installs.

---

## Try it (develop in this repo)

```bash
npm install
npm run test          # fixture-driven compiler tests
npm run typecheck
npm run dev           # Vite playground → http://localhost:5173
```

Rebuild the CLI by hand (optional—`prepare` already does this after `npm install`):

```bash
npm run build:cli
node dist/jeml.mjs compile tests/examples/01-hello-world.jeml
node dist/jeml.mjs serve tests/examples/12-full-landing.jeml --open
```

---

## Learn the language

| Resource | What it’s for |
|----------|----------------|
| **[`docs/index.html`](docs/index.html)** | Illustrated tutorial (open locally, or publish **`/docs`** on GitHub Pages for a public site). |
| **[`spec/RULEBOOK.md`](spec/RULEBOOK.md)** | Authoritative **v0.4** syntax and semantics. |
| **[`spec/ELEMENT_MAPPING.md`](spec/ELEMENT_MAPPING.md)** | How tags and attributes map to HTML. |
| **[`tests/examples/`](tests/examples/)** + **[`tests/expected/`](tests/expected/)** | Executable examples — the compiler’s contract. |

**Contributors & coding agents:** start with [`KICKOFF.md`](KICKOFF.md), then read `RULEBOOK.md` → `ELEMENT_MAPPING.md` → the example pairs above.

---

## Project layout

```
src/
  parser/        AST, attribute lexer, line-based parser (v0.4)
  compiler/    HTML codegen
  cli/           compile + local preview server
  playground/    Vite dev UI
  grammar/       Peggy grammar (long-term; line parser is canonical today)
spec/
  RULEBOOK.md
  ELEMENT_MAPPING.md
docs/
  index.html     Visual tutorial (GitHub Pages–ready with .nojekyll)
tests/
  examples/*.jeml
  expected/*.html
  compiler.test.ts
```

---

## Status & direction

Today this repo is a **working static compiler** for the **v0.4** surface syntax (directives `>>` / `<<`, blocks, inlines, voids, variants, rich attributes, paired fixtures). **Reactivity, `>> script`, imports, and control flow** are specified and sketched in the docs but not the focus of the current milestone.

If you want JEML to exist as a serious alternative to hand-written HTML for static sites and prototypes, the most helpful things are: **clear bug reports**, **spec questions**, **example pages**, and **small PRs** that extend tests before code.

---

## Contributing

New behavior should almost always land as a **new paired** `tests/examples/NN-….jeml` and `tests/expected/NN-….html` (or an update to an existing pair) so the intent stays obvious. See `KICKOFF.md` for workflow and conventions.

The `src/compiler/targets/typescript/` area is reserved for future **script** compilation targets (TypeScript first; other languages later) without entangling the core markup pipeline.
