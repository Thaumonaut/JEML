# JOTLANG — monorepo

JOTLANG — a markup language for UI templating that compiles to HTML.

This repository is organized as an npm workspaces monorepo with three packages:

| Package | Description |
|---------|-------------|
| [`@jotl/compiler`](./packages/compiler) | The JOTL → HTML compiler (reference implementation, TypeScript + Peggy) |
| [`jotlang-lsp`](./packages/lsp) | Language Server Protocol implementation for editor intelligence |
| [`jotlang-language`](./packages/vscode-extension) | VS Code extension — grammar + bundled LSP client |

Documentation lives in `docs/` and the authoritative language spec in `spec/RULEBOOK.md`.

## Quick start

```bash
npm install                                       # install + link workspaces
npm run build                                     # build all packages
```

Run the compiler playground:
```bash
npm run dev
```

Run the LSP smoke test:
```bash
node packages/lsp/dist/test/smoke.test.js
```

Package the VS Code extension:
```bash
cd packages/vscode-extension
npm run build
npx vsce package --allow-missing-repository --no-dependencies
```

Run the end-to-end LSP test (starts the server, sends real LSP messages):
```bash
node test/e2e-lsp.js
```

## Current status

- **v0.4** spec locked. See `spec/RULEBOOK.md` for the authoritative grammar.
- **Compiler** — reference implementation in progress. Static subset compiles today; responsive CSS codegen is milestone 2; reactivity is milestone 3+.
- **LSP** — v0.1 shipping. Diagnostics, completions, and hover all functional.
- **VS Code extension** — v0.4 shipping. Syntax highlighting (TextMate) + LSP integration.

## Documentation

- [`spec/RULEBOOK.md`](./spec/RULEBOOK.md) — authoritative language specification
- [`spec/ELEMENT_MAPPING.md`](./spec/ELEMENT_MAPPING.md) — JOTL → HTML compilation table
- [`docs/TUTORIAL.md`](./docs/TUTORIAL.md) — introductory tutorial in markdown
- [`docs/tutorial.html`](./docs/tutorial.html) — illustrated HTML tutorial with live previews
- [`KICKOFF.md`](./KICKOFF.md) — implementation briefing for contributors
- [`INTEGRATION.md`](./INTEGRATION.md) — how to migrate an existing JOTL fork to this monorepo

## License

MIT
