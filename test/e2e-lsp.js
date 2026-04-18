// End-to-end test — spawns the bundled server and exchanges LSP messages.
//
// Simulates what VS Code does: start the child process, send Initialize,
// open a document, and check that diagnostics come back.

const { spawn } = require('child_process');
const path = require('path');

const SERVER = path.resolve(
  __dirname,
  '../packages/vscode-extension/out/server.js'
);

function encode(msg) {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

async function run() {
  const proc = spawn('node', [SERVER, '--stdio']);
  let id = 1;
  const messages = [];
  let buf = Buffer.alloc(0);

  proc.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    // Parse LSP framing — headers are ASCII, body is UTF-8 with known byte length
    while (true) {
      const headerEnd = buf.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = buf.slice(0, headerEnd).toString('ascii');
      const match = header.match(/Content-Length: (\d+)/);
      if (!match) {
        // Malformed header — drop it
        buf = buf.slice(headerEnd + 4);
        continue;
      }
      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (buf.length < bodyStart + contentLength) break;
      const body = buf.slice(bodyStart, bodyStart + contentLength).toString('utf8');
      buf = buf.slice(bodyStart + contentLength);
      try {
        messages.push(JSON.parse(body));
      } catch (e) {
        console.error('Parse error:', body.slice(0, 200));
      }
    }
  });

  proc.stderr.on('data', (chunk) => {
    console.error('[server stderr]', chunk.toString());
  });

  function send(msg) {
    proc.stdin.write(encode(msg));
  }

  // 1. Initialize
  send({
    jsonrpc: '2.0',
    id: id++,
    method: 'initialize',
    params: {
      processId: process.pid,
      rootUri: null,
      capabilities: {},
    },
  });

  await new Promise((r) => setTimeout(r, 300));

  send({ jsonrpc: '2.0', method: 'initialized', params: {} });

  // 2. Open a document with errors
  const SAMPLE = `>> document:
  > heading.9: bad level <
  > unknowntag: oops <
  > text [color="red" ^(500px)="blue"]: hi <
<< document
`;

  send({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: 'file:///test.jeml',
        languageId: 'jeml',
        version: 1,
        text: SAMPLE,
      },
    },
  });

  await new Promise((r) => setTimeout(r, 500));

  // 3. Request completions after `> heading.`
  const completionSample = `>> document:
  > heading.`;
  send({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: 'file:///completion.jeml',
        languageId: 'jeml',
        version: 1,
        text: completionSample,
      },
    },
  });

  await new Promise((r) => setTimeout(r, 200));

  send({
    jsonrpc: '2.0',
    id: id++,
    method: 'textDocument/completion',
    params: {
      textDocument: { uri: 'file:///completion.jeml' },
      position: { line: 1, character: 12 },
    },
  });

  // 4. Request hover on "heading"
  send({
    jsonrpc: '2.0',
    id: id++,
    method: 'textDocument/hover',
    params: {
      textDocument: { uri: 'file:///test.jeml' },
      position: { line: 1, character: 5 },
    },
  });

  await new Promise((r) => setTimeout(r, 500));

  // Shutdown
  send({ jsonrpc: '2.0', id: id++, method: 'shutdown', params: null });
  send({ jsonrpc: '2.0', method: 'exit', params: null });

  await new Promise((r) => setTimeout(r, 200));
  proc.kill();

  // Report
  console.log(`\nReceived ${messages.length} messages from server.\n`);

  const initResp = messages.find((m) => m.id === 1);
  console.log('── Initialize response ──');
  if (initResp?.result?.capabilities) {
    const caps = Object.keys(initResp.result.capabilities);
    console.log('  Server capabilities:', caps.join(', '));
    console.log('  Server name:', initResp.result.serverInfo?.name);
    console.log('  Server version:', initResp.result.serverInfo?.version);
  } else {
    console.log('  No response');
  }

  console.log('\n── Diagnostics ──');
  const diags = messages.filter((m) => m.method === 'textDocument/publishDiagnostics');
  for (const d of diags) {
    console.log(`  URI: ${d.params.uri}`);
    for (const diag of d.params.diagnostics) {
      const sev = diag.severity === 1 ? 'ERROR' : diag.severity === 2 ? 'WARN' : 'INFO';
      console.log(`    [${sev}] ${diag.range.start.line}:${diag.range.start.character} — ${diag.message}`);
    }
  }

  console.log('\n── Completions (variant of heading.) ──');
  const complResp = messages.find((m) => m.id === 2);
  if (complResp?.result) {
    const items = Array.isArray(complResp.result) ? complResp.result : complResp.result.items;
    for (const item of (items || []).slice(0, 8)) {
      console.log(`  .${item.label}  —  ${item.detail || ''}`);
    }
  } else {
    console.log('  (no result)');
  }

  console.log('\n── Hover (heading tag) ──');
  const hoverResp = messages.find((m) => m.id === 3);
  if (hoverResp?.result) {
    const value = hoverResp.result.contents?.value || JSON.stringify(hoverResp.result.contents);
    console.log(value.split('\n').slice(0, 8).map((l) => '  ' + l).join('\n'));
  } else {
    console.log('  (no hover)');
  }

  console.log('\nDONE');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
