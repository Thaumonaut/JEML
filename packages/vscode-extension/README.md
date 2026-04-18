# JEML Language Support for VS Code

Syntax highlighting, diagnostics, completions, and hover documentation for [JEML](https://github.com/Thaumonaut/JEML) — Jacob's Easy Markup Language.

Works in VS Code and Cursor.

## Features

### Syntax highlighting
Distinct colors for every structural element: directives (`>>` / `<<`), blocks (`>` / `<`), inline (`/>` / `</`), void (`!>`), variants (`.1`, `.primary`), references (`&`, `@`, `$`), responsive overrides (`^(500px)=`), and Markdown-style text formatting.

### Diagnostics (via bundled language server)
Real errors for real problems as you type:
- Unknown tags with a hint when lowercase (likely a user component missing an import)
- Invalid variants — `heading.7` → "Valid variants: 1, 2, 3, 4, 5, 6"
- Unclosed blocks, directives, and inline elements
- Mismatched closers (using `<` where `<<` is needed)
- Responsive overrides on style attributes (rulebook §8.7)
- Unterminated strings and block comments

### Completions
Context-aware suggestions:
- After `>`, `/>`, `!>`, `>>`: tag names filtered by element flavor
- After `tagname.`: valid variants for that tag
- Inside `[...]`: attribute names valid for the enclosing tag
- After `attr=`: enum values (e.g., `type=` suggests `text`, `email`, `password`, etc.)
- At start of file: directive snippets (`>> meta`, `>> document`, `>> script`, etc.)

### Hover
Hover any token for rich markdown documentation:
- Sigils link to the relevant rulebook section
- Tags show HTML mapping, valid variants, and recognized attributes
- Attributes show accepted value types and whether they support responsive overrides
- References show their role (value, handler, or iterator)

## Installation

### From VSIX
```bash
code --install-extension jeml-language-0.4.0.vsix
```

For Cursor:
```bash
cursor --install-extension jeml-language-0.4.0.vsix
```

### From source (development)
```bash
git clone https://github.com/Thaumonaut/JEML
cd JEML
npm install
npm run build --workspace=@jeml/lsp
npm run build --workspace=jeml-language
cd packages/vscode-extension
npx vsce package --allow-missing-repository --no-dependencies
code --install-extension jeml-language-0.4.0.vsix
```

## Architecture

This extension is a thin client for the [@jeml/lsp](../lsp) language server. The grammar handles syntax highlighting (TextMate regex-based), while the language server handles everything semantic (parse tree analysis, diagnostics, completions, hover). Both bundles ship together in the `.vsix`.

When you open a `.jeml` file, the extension spawns the LSP server as a child process and establishes a JSON-RPC connection over stdio. All language intelligence lives in the server; this extension is ~30 lines of glue.

## Configuration

| Setting | Values | Description |
|---------|--------|-------------|
| `jeml.trace.server` | `off`, `messages`, `verbose` | Trace LSP traffic for debugging |

## License

MIT
