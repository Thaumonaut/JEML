/**
 * VS Code extension entry point.
 *
 * Spawns the JOTLANG language server as a child process and establishes an LSP
 * connection over stdio. The extension itself does almost nothing — all
 * language intelligence lives in the server.
 */

import * as path from 'path';
import { ExtensionContext, workspace } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
  // Path to the bundled LSP server. esbuild produces this from jotlang-lsp's
  // server.js entry point, with all its dependencies inlined.
  const serverModule = context.asAbsolutePath(path.join('out', 'server.js'));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'jotlang' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.jot'),
    },
  };

  client = new LanguageClient(
    'jotlangLanguageServer',
    'JOTLANG Language Server',
    serverOptions,
    clientOptions,
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}
