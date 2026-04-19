#!/usr/bin/env node
/**
 * JOTL Language Server.
 *
 * Entry point for the LSP. Handles initialization, document lifecycle, and
 * dispatches requests to feature providers.
 *
 * Invoked via stdio by the VS Code extension or any other LSP client.
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionItem,
  Hover,
  Diagnostic,
  TextDocumentPositionParams,
  DocumentDiagnosticReportKind,
  DocumentDiagnosticParams,
  DocumentDiagnosticReport,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { tokenize } from './parser/tokenizer';
import { buildTokenIndex } from './parser/index';
import { computeDiagnostics } from './features/diagnostics';
import { computeCompletions } from './features/completions';
import { computeHover } from './features/hover';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// ─────────────────────────────────────────────────────
// Per-document cache of tokenization results
// ─────────────────────────────────────────────────────
interface CachedAnalysis {
  version: number;
  tokens: ReturnType<typeof tokenize>;
  index: ReturnType<typeof buildTokenIndex>;
}

const cache = new Map<string, CachedAnalysis>();

function analyze(doc: TextDocument): CachedAnalysis {
  const cached = cache.get(doc.uri);
  if (cached && cached.version === doc.version) return cached;

  const tokenResult = tokenize(doc.getText());
  const index = buildTokenIndex(tokenResult.tokens);
  const analysis: CachedAnalysis = {
    version: doc.version,
    tokens: tokenResult,
    index,
  };
  cache.set(doc.uri, analysis);
  return analysis;
}

// ─────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────
connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['>', '/', '!', '.', '[', ' ', '=', '&', '@', '$', '^'],
      },
      hoverProvider: true,
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
    },
    serverInfo: {
      name: 'jotl-lsp',
      version: '0.1.0',
    },
  };
});

connection.onInitialized(() => {
  connection.console.log('JOTL language server initialized.');
});

// ─────────────────────────────────────────────────────
// Document lifecycle → diagnostics
// ─────────────────────────────────────────────────────
documents.onDidChangeContent(change => {
  const analysis = analyze(change.document);
  const diagnostics: Diagnostic[] = computeDiagnostics(analysis.tokens);
  connection.sendDiagnostics({
    uri: change.document.uri,
    diagnostics,
  });
});

documents.onDidClose(e => {
  cache.delete(e.document.uri);
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

// Pull diagnostics — LSP 3.17+ clients (including current VS Code) may request
// diagnostics explicitly via this method instead of relying on pushed
// notifications. We support both to work with any client generation.
connection.languages.diagnostics.on(
  async (params: DocumentDiagnosticParams): Promise<DocumentDiagnosticReport> => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) {
      return {
        kind: DocumentDiagnosticReportKind.Full,
        items: [],
      };
    }
    const analysis = analyze(doc);
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: computeDiagnostics(analysis.tokens),
    };
  },
);

// ─────────────────────────────────────────────────────
// Completions
// ─────────────────────────────────────────────────────
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const analysis = analyze(doc);
  return computeCompletions({
    index: analysis.index,
    line: params.position.line,
    column: params.position.character,
    source: doc.getText(),
  });
});

// ─────────────────────────────────────────────────────
// Hover
// ─────────────────────────────────────────────────────
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const analysis = analyze(doc);
  return computeHover({
    index: analysis.index,
    line: params.position.line,
    column: params.position.character,
  });
});

// ─────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────
documents.listen(connection);
connection.listen();
