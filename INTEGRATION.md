# Integrating the LSP into your existing JEML repo

Your current `Thaumonaut/JEML` repo has this structure:

```
JEML/
├── docs/
├── spec/
├── src/                    # compiler source
├── styles/
├── tests/
├── KICKOFF.md
├── README.md
├── package.json
└── ...
```

The LSP work I just completed is a **monorepo** with this structure:

```
packages/
├── lsp/                    # @jeml/lsp — the language server
└── vscode-extension/       # jeml-language — the VS Code extension
```

You have two choices for integrating: **migrate to a monorepo** (recommended), or **keep things separate** (faster, but more repos to maintain).

## Path A — Migrate to monorepo (recommended)

This is the right long-term structure. All JEML work (compiler, LSP, tools, future packages like a Prettier plugin or a Vite plugin) lives in one repo.

### Steps

1. **Create `packages/compiler/`** and move your existing code into it:
   ```bash
   mkdir -p packages/compiler
   mv src packages/compiler/
   mv tests packages/compiler/
   mv styles packages/compiler/   # if the styles are specific to the compiler
   mv vite.config.ts packages/compiler/
   mv tsconfig.json packages/compiler/
   ```

2. **Copy in the new packages**:
   Unzip the provided `jeml-monorepo.zip` into your repo root. It contains:
   - `packages/lsp/` — the language server
   - `packages/vscode-extension/` — the VS Code extension
   - Root `package.json` with npm workspaces configured

3. **Merge the root `package.json`**:
   Your existing root `package.json` has the compiler's build scripts. The new one configures workspaces. Merge them by:
   - Keeping the new `"workspaces": ["packages/*"]` field
   - Updating the compiler's `package.json` (now at `packages/compiler/package.json`) with a `"name": "@jeml/compiler"` and its own scripts
   - Making the root package scripts delegate to workspaces

4. **Install with workspaces**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
   This installs all workspace packages and symlinks them together.

5. **Build everything**:
   ```bash
   npm run build    # builds all packages
   ```

6. **Try the LSP locally**:
   ```bash
   cd packages/vscode-extension
   npm run build
   npx vsce package --allow-missing-repository --no-dependencies
   code --install-extension jeml-language-0.4.0.vsix
   ```

### Final layout

```
JEML/
├── packages/
│   ├── compiler/              # was your src/ + tests/
│   │   ├── src/
│   │   ├── tests/
│   │   └── package.json
│   ├── lsp/                   # new — language server
│   │   ├── src/
│   │   └── package.json
│   └── vscode-extension/      # new — VS Code extension
│       ├── src/
│       ├── syntaxes/
│       └── package.json
├── docs/
├── spec/
├── KICKOFF.md
├── README.md
└── package.json              # workspaces root
```

## Path B — Keep things separate

If you don't want to refactor the existing repo, you can drop the LSP and extension into subdirectories without restructuring:

```bash
mkdir jeml-lsp
# Copy packages/lsp/* into jeml-lsp/

mkdir jeml-vscode
# Copy packages/vscode-extension/* into jeml-vscode/
```

You'd need to manually manage the LSP's build path reference in `jeml-vscode/esbuild.js` — change the `LSP_SERVER_ENTRY` from `'..'/'lsp'/...` to wherever `jeml-lsp` ends up.

Simpler to set up, harder to maintain — any change that crosses packages (e.g., updating the tag registry, which lives in the LSP but the compiler should also consume) requires coordinated changes across two places instead of one.

## What about the old `jeml-vscode` extension you already have?

The new extension replaces it entirely. Before installing the new one:

```bash
code --uninstall-extension jeml.jeml-language
```

The new version preserves all the syntax highlighting from the old one (I copied the same `jeml.tmLanguage.json` over) and adds the LSP layer on top.

## Verifying it works

After installing the new extension, open any `.jeml` file from `tests/examples/` and:

1. **Type `> head`** in an empty line — completion should show `heading`, `header`, etc.
2. **Type `> heading.`** — should show the 6 numbered variants
3. **Hover over `heading`** — should show a tooltip with the HTML mapping and variants list
4. **Write `> heading.9: bad <`** — should show a red squiggle with "Unknown variant '9' for tag 'heading'..."
5. **Write `> text [color="red" ^(500px)="blue"]: hi <`** — should show a yellow warning on the responsive override

If any of these don't work, check the Output panel → "JEML Language Server" channel for server logs.

## If you hit issues

The LSP can be run standalone from its package directory:

```bash
cd packages/lsp
node dist/server.js --stdio
```

It should start silently and wait for LSP messages on stdin. If it errors immediately, the build is broken — run `npm run build` in that directory.

The VS Code extension has `jeml.trace.server` as a setting — set it to `"verbose"` and the Output panel will show every LSP message, which is useful for debugging why a feature isn't triggering.
