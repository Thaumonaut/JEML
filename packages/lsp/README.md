# jotl-lsp

The JOTL Language Server — implements the Language Server Protocol (LSP) to provide editor intelligence for `.jot` files in any editor that supports LSP.

## What it provides

- **Diagnostics** — unknown tags, invalid variants, unclosed blocks, responsive overrides on style attributes, mismatched closers, unterminated strings
- **Completions** — tag names (filtered by context), variants for the current tag, attribute names valid for the current tag, enum values for attributes like `type`, root-level directive snippets
- **Hover** — rich markdown tooltips for sigils, tags (with variants and attributes), individual variants, attributes (with accepted values and responsive capability), and references

## Installation

```bash
npm install -g jotl-lsp
```

This installs the `jotl-lsp` binary, which communicates over stdio (the default transport for LSP).

## Editor setup

### VS Code / Cursor

Install the [JOTL Language Support extension](../vscode-extension) — it bundles this server internally. No separate installation needed.

### Neovim (nvim-lspconfig)

```lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

if not configs.jotl then
  configs.jotl = {
    default_config = {
      cmd = { 'jotl-lsp', '--stdio' },
      filetypes = { 'jotl' },
      root_dir = lspconfig.util.root_pattern('package.json', '.git'),
      settings = {},
    },
  }
end

lspconfig.jotl.setup({})
```

### Zed

In your `settings.json`:

```json
{
  "languages": {
    "JOTL": {
      "language_servers": ["jotl-lsp"]
    }
  },
  "lsp": {
    "jotl-lsp": {
      "binary": {
        "path": "jotl-lsp",
        "arguments": ["--stdio"]
      }
    }
  }
}
```

### Helix

In your `languages.toml`:

```toml
[[language]]
name = "jotl"
scope = "source.jotl"
file-types = ["jot"]
language-servers = ["jotl-lsp"]

[language-server.jotl-lsp]
command = "jotl-lsp"
args = ["--stdio"]
```

## Architecture

The server has three layers:

1. **Data** (`src/data/`) — static registries of sigils, tags, and attributes. The canonical source of truth for what JOTL knows about itself.
2. **Parser** (`src/parser/`) — a lightweight token-stream tokenizer with position indexing. This is separate from the compiler's Peggy grammar because LSP needs per-character classification for hover and cursor queries, not full AST construction.
3. **Features** (`src/features/`) — diagnostics, completions, and hover providers. Each consumes the token stream and data registries to produce LSP responses.

The `server.ts` entry wires the features to the LSP connection and manages per-document analysis caching.

## Development

```bash
# Build
npm run build

# Type check
npm run typecheck

# Run the smoke test
npm run test
```

## License

MIT
