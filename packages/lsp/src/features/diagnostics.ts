/**
 * Diagnostics — produces LSP diagnostic objects from tokenized input.
 *
 * Kinds of diagnostics produced:
 *   1. Tokenization errors (unterminated strings, block comments)
 *   2. Unknown tag names (warning — could be a user component)
 *   3. Unknown variant on a known tag (error)
 *   4. Responsive override on a non-responsive attribute (warning)
 *   5. Unclosed block (error, heuristic — counts open/close pairs)
 *
 * These are layered diagnostics built on top of the tokenizer's flat
 * stream. They're heuristic in places; the compiler's Peggy parser
 * remains the authoritative validator.
 */

import {
  Diagnostic,
  DiagnosticSeverity,
  Range as LspRange,
} from 'vscode-languageserver/node';

import { TokenizeResult, Token, Range as TokenRange } from '../parser/tokens';
import { lookupTag, TagDefinition } from '../data/tags';
import { lookupAttribute } from '../data/attributes';

export function computeDiagnostics(result: TokenizeResult): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // 1. Tokenizer errors
  for (const err of result.errors) {
    diagnostics.push({
      severity:
        err.severity === 'error'
          ? DiagnosticSeverity.Error
          : DiagnosticSeverity.Warning,
      range: toLspRange(err.range),
      message: err.message,
      source: 'jotl',
    });
  }

  const tokens = result.tokens;

  // 2 + 3. Check tag names and their variants
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== 'tag-name') continue;

    const tagDef = lookupTag(t.text);

    // Unknown tag — warn, don't error. Could be a user-defined component.
    if (!tagDef) {
      // Only warn if the first letter is lowercase (components conventionally
      // use Capitalized names).
      if (t.text[0] === t.text[0].toLowerCase()) {
        diagnostics.push({
          severity: DiagnosticSeverity.Information,
          range: toLspRange(t.range),
          message: `Unknown tag '${t.text}'. If this is a user-defined component, consider using a capitalized name.`,
          source: 'jotl',
        });
      }
      continue;
    }

    // Collect variants following this tag (variant-dot variant-name, repeating)
    const variants = collectVariants(tokens, i);
    for (const v of variants) {
      if (tagDef.variants.length === 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: toLspRange(v.range),
          message: `Tag '${t.text}' does not accept variants.`,
          source: 'jotl',
        });
      } else {
        const allowed = tagDef.variants.map(vd => vd.name);
        if (!allowed.includes(v.text)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: toLspRange(v.range),
            message: `Unknown variant '${v.text}' for tag '${t.text}'. Valid variants: ${allowed.join(', ')}.`,
            source: 'jotl',
          });
        }
      }
    }
  }

  // 4. Responsive override on non-responsive attribute
  //    Pattern: attr-name, (responsive-caret, responsive-open, ..., responsive-close, attr-eq)
  //    or:      attr-name, attr-eq, ..., (responsive-caret, ...)
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'responsive-caret') continue;

    // Walk backwards to find the attribute this applies to
    const attrName = findOwningAttribute(tokens, i);
    if (!attrName) continue;

    const attrDef = lookupAttribute(attrName.text);
    if (attrDef && !attrDef.responsive) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: toLspRange(tokens[i].range),
        message: `Responsive override on style attribute '${attrName.text}' is discouraged. Layout attributes accept overrides; for theming, use a design token system instead. (Rulebook §8.7)`,
        source: 'jotl',
      });
    }
  }

  // 5. Unclosed block detection (heuristic)
  const structuralErrors = detectUnclosedBlocks(tokens);
  diagnostics.push(...structuralErrors);

  return diagnostics;
}

// ─────────────────────────────────────────────────────
// Variant collection
// ─────────────────────────────────────────────────────
function collectVariants(tokens: Token[], tagIndex: number): Token[] {
  const variants: Token[] = [];
  let i = tagIndex + 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === 'variant-dot') {
      const next = tokens[i + 1];
      if (next && next.kind === 'variant-name') {
        variants.push(next);
        i += 2;
        continue;
      }
    }
    break;
  }
  return variants;
}

// ─────────────────────────────────────────────────────
// Find the attribute a responsive override applies to
// ─────────────────────────────────────────────────────
function findOwningAttribute(tokens: Token[], caretIndex: number): Token | null {
  // Two patterns:
  //
  //   explicit:  attr^(500px)=...
  //              ^^^^ ^ ^  ^ ^
  //              [i-1][i]...
  //
  //   implicit:  attr=value ^(500px)=...
  //                             ^
  //              Walk back past values and whitespace until we find the most
  //              recent attr-name token inside the current [...] group.
  //
  // We don't need to distinguish the two forms for the warning — we just need
  // to find the owning attribute name.

  for (let j = caretIndex - 1; j >= 0; j--) {
    const t = tokens[j];
    if (t.kind === 'attr-bracket-open') return null; // reached start of attr list
    if (t.kind === 'attr-bracket-close') return null; // different attr list
    if (t.kind === 'attr-name') return t;
  }
  return null;
}

// ─────────────────────────────────────────────────────
// Structural check: unclosed blocks
//
// A directive is "open" (needs '<<') only if a ':' appears after its header.
// Otherwise it's a single-line directive like `>> meta [...]` which is
// complete on its own.
// ─────────────────────────────────────────────────────
function detectUnclosedBlocks(tokens: Token[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const stack: { token: Token; kind: 'directive' | 'block' | 'inline' }[] = [];

  // First pass: classify each directive-open as "has body" or "headless"
  // based on whether a ':' appears on the same logical header (before a
  // newline that breaks the header, or before the next structural sigil).
  const hasBody = classifyDirectiveOpens(tokens);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.kind) {
      case 'directive-open':
        if (hasBody.get(i) === true) {
          stack.push({ token: t, kind: 'directive' });
        }
        break;
      case 'block-open':
        stack.push({ token: t, kind: 'block' });
        break;
      case 'inline-open':
        stack.push({ token: t, kind: 'inline' });
        break;
      case 'directive-close': {
        const popped = stack.pop();
        if (!popped) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: toLspRange(t.range),
            message: "Directive close '<<' with no matching '>>' open.",
            source: 'jotl',
          });
        } else if (popped.kind !== 'directive') {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: toLspRange(t.range),
            message: `Directive close '<<' but the innermost open is a ${popped.kind}.`,
            source: 'jotl',
          });
          // Put it back — the '<<' may actually close something outer
          stack.push(popped);
        }
        break;
      }
      case 'block-close': {
        const popped = stack.pop();
        if (!popped) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: toLspRange(t.range),
            message: "Block close '<' with no matching '>' open.",
            source: 'jotl',
          });
        } else if (popped.kind === 'directive') {
          // Directive with body should close with '<<', not '<'. But people
          // also write `< section` to close a block section, so only warn
          // if we're sure.
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: toLspRange(t.range),
            message: "Block close '<' used to close a directive — use '<<' instead.",
            source: 'jotl',
          });
          stack.push(popped);
        }
        break;
      }
      case 'inline-close': {
        const popped = stack.pop();
        if (!popped) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: toLspRange(t.range),
            message: "Inline close '</' with no matching '/>' open.",
            source: 'jotl',
          });
        } else if (popped.kind !== 'inline') {
          // Mismatch — put back
          stack.push(popped);
        }
        break;
      }
    }
  }

  // Anything left on the stack is unclosed
  for (const entry of stack) {
    const word =
      entry.kind === 'directive'
        ? 'directive'
        : entry.kind === 'block'
        ? 'block'
        : 'inline element';
    const closer = entry.kind === 'directive' ? '<<' : entry.kind === 'inline' ? '</' : '<';
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: toLspRange(entry.token.range),
      message: `Unclosed ${word}. Add '${closer}' to close it.`,
      source: 'jotl',
    });
  }

  return diagnostics;
}

/**
 * For each directive-open token, determine whether it has a body (opens a
 * ':' content section) or is a single-line directive (no ':').
 *
 * Returns a Map<tokenIndex, boolean> where true means "has body, needs '<<'".
 */
function classifyDirectiveOpens(tokens: Token[]): Map<number, boolean> {
  const result = new Map<number, boolean>();

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'directive-open') continue;

    // Scan forward from i looking for a ':' that terminates the header.
    // The header ends at:
    //   - the first ':' (has body)
    //   - a newline NOT inside [...]  (no body, single-line)
    //   - end of stream
    let depth = 0;
    let sawColon = false;
    for (let j = i + 1; j < tokens.length; j++) {
      const tk = tokens[j];
      if (tk.kind === 'attr-bracket-open') depth++;
      else if (tk.kind === 'attr-bracket-close') depth--;
      else if (tk.kind === 'newline' && depth === 0) {
        // Header ended without ':'
        break;
      } else if (tk.kind === 'content-delim' && depth === 0) {
        sawColon = true;
        break;
      }
    }
    result.set(i, sawColon);
  }

  return result;
}

// ─────────────────────────────────────────────────────
// Range conversion
// ─────────────────────────────────────────────────────
function toLspRange(r: TokenRange): LspRange {
  return {
    start: { line: r.start.line, character: r.start.column },
    end: { line: r.end.line, character: r.end.column },
  };
}
