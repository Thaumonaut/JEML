// Smoke test — runs the tokenizer and diagnostics on sample JOTL and prints results.
// Run with: node dist/test/smoke.test.js

import { tokenize } from '../parser/tokenizer';
import { buildTokenIndex } from '../parser/index';
import { computeDiagnostics } from '../features/diagnostics';
import { computeCompletions } from '../features/completions';
import { computeHover } from '../features/hover';

const VALID_EXAMPLE = `>> meta [
  title="Test page"
  description="A small example"
]

>> document:
  > heading.1: Hello, world <
  > section [id=main]:
    > text: This is a paragraph with **bold** text. <
    > grid [cols=1 ^(768px)=2 gap=md]:
      > card: A <
      > card: B <
    < grid
  < section
<< document
`;

const INVALID_EXAMPLE = `>> document:
  > heading.7: Bad level <
  > unknowntag: something <
  > text [color="red" ^(500px)="blue"]: text <
  > section [id=x]:
    > card: missing close
<< document
`;

function hr(title: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(' ' + title);
  console.log('═'.repeat(60));
}

hr('Valid example — tokens');
const r1 = tokenize(VALID_EXAMPLE);
for (const t of r1.tokens.filter(t => t.kind !== 'whitespace' && t.kind !== 'newline')) {
  console.log(`  ${t.kind.padEnd(20)} | ${JSON.stringify(t.text)}`);
}
console.log(`\n  [${r1.tokens.length} tokens, ${r1.errors.length} errors]`);

hr('Valid example — diagnostics');
const d1 = computeDiagnostics(r1);
for (const d of d1) {
  const sev = d.severity === 1 ? 'ERROR' : d.severity === 2 ? 'WARN' : 'INFO';
  console.log(`  [${sev}] ${d.range.start.line}:${d.range.start.character} — ${d.message}`);
}
if (d1.length === 0) console.log('  (none — clean file)');

hr('Invalid example — diagnostics');
const r2 = tokenize(INVALID_EXAMPLE);
const d2 = computeDiagnostics(r2);
for (const d of d2) {
  const sev = d.severity === 1 ? 'ERROR' : d.severity === 2 ? 'WARN' : 'INFO';
  console.log(`  [${sev}] ${d.range.start.line}:${d.range.start.character} — ${d.message}`);
}

hr('Completion: after `> ` at start of line');
const completionSample = `>> document:
  > `;
const r3 = tokenize(completionSample);
const idx3 = buildTokenIndex(r3.tokens);
const lines3 = completionSample.split('\n');
const completions = computeCompletions({
  index: idx3,
  line: lines3.length - 1,
  column: lines3[lines3.length - 1].length,
  source: completionSample,
});
console.log(`  Got ${completions.length} completions. First 8:`);
for (const c of completions.slice(0, 8)) {
  console.log(`    ${c.label.padEnd(20)} ${c.detail ?? ''}`);
}

hr('Completion: after `heading.`');
const variantSample = `>> document:
  > heading.`;
const r4 = tokenize(variantSample);
const idx4 = buildTokenIndex(r4.tokens);
const lines4 = variantSample.split('\n');
const variantCompletions = computeCompletions({
  index: idx4,
  line: lines4.length - 1,
  column: lines4[lines4.length - 1].length,
  source: variantSample,
});
for (const c of variantCompletions) {
  console.log(`    .${c.label.padEnd(10)} ${c.detail ?? ''}`);
}

hr('Completion: after `[` in `> grid [`');
const attrSample = `>> document:
  > grid [`;
const r5 = tokenize(attrSample);
const idx5 = buildTokenIndex(r5.tokens);
const lines5 = attrSample.split('\n');
const attrCompletions = computeCompletions({
  index: idx5,
  line: lines5.length - 1,
  column: lines5[lines5.length - 1].length,
  source: attrSample,
});
console.log(`  Got ${attrCompletions.length} attribute completions. First 8:`);
for (const c of attrCompletions.slice(0, 8)) {
  console.log(`    ${c.label.padEnd(15)} ${c.detail ?? ''}`);
}

hr('Completion: after `type=` in `!> field [type=`');
const enumSample = `>> document:
  !> field [type=`;
const r6 = tokenize(enumSample);
const idx6 = buildTokenIndex(r6.tokens);
const lines6 = enumSample.split('\n');
const enumCompletions = computeCompletions({
  index: idx6,
  line: lines6.length - 1,
  column: lines6[lines6.length - 1].length,
  source: enumSample,
});
for (const c of enumCompletions) {
  console.log(`    ${c.label}`);
}

hr('Hover: over `heading` in `> heading.1: ...`');
const hoverSample = `> heading.1: Hello <`;
const r7 = tokenize(hoverSample);
const idx7 = buildTokenIndex(r7.tokens);
const hover = computeHover({ index: idx7, line: 0, column: 3 }); // mid-"heading"
if (hover) {
  const value = typeof hover.contents === 'object' && 'value' in hover.contents
    ? hover.contents.value
    : JSON.stringify(hover.contents);
  console.log(value);
} else {
  console.log('  (no hover)');
}

hr('Hover: over `cols` in `> grid [cols=3]`');
const hoverSample2 = `> grid [cols=3]:`;
const r8 = tokenize(hoverSample2);
const idx8 = buildTokenIndex(r8.tokens);
const hover2 = computeHover({ index: idx8, line: 0, column: 9 }); // mid-"cols"
if (hover2) {
  const value = typeof hover2.contents === 'object' && 'value' in hover2.contents
    ? hover2.contents.value
    : JSON.stringify(hover2.contents);
  console.log(value);
} else {
  console.log('  (no hover)');
}

hr('DONE');
