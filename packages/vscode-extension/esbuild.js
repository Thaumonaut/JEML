// esbuild configuration for packaging the extension.
//
// We build two bundles:
//   1. extension.js — runs in the VS Code extension host, imports vscode API.
//      Marked `vscode` as external because it's provided by the host.
//   2. server.js — runs as a child process (the LSP server). Bundles all of
//      jotlang-lsp, including its node_modules tree, into a single file.
//
// Both are IIFE-compatible CommonJS modules for Node 18+.

const esbuild = require('esbuild');

const path = require('path');

// Absolute path to the LSP's compiled entry. Built first by the workspace.
const LSP_SERVER_ENTRY = path.resolve(__dirname, '..', 'lsp', 'dist', 'server.js');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  external: ['vscode'],
  logLevel: 'info',
};

async function build() {
  await Promise.all([
    esbuild.build({
      ...common,
      entryPoints: ['src/extension.ts'],
      outfile: 'out/extension.js',
    }),
    esbuild.build({
      ...common,
      entryPoints: [LSP_SERVER_ENTRY],
      outfile: 'out/server.js',
    }),
  ]);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
