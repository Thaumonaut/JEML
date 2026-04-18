/**
 * Token index — supports "what token is at position X?" queries.
 */

import { Token, TokenIndex } from './tokens';

export function buildTokenIndex(tokens: Token[]): TokenIndex {
  // Tokens are already in source order; we can binary search by offset.

  const offsets = tokens.map(t => t.range.start.offset);

  function offsetOf(line: number, column: number): number {
    // Walk tokens to find a token starting at or after this line/column.
    // Small files are the common case, so linear is fine. We could build
    // a line-index for large files later.
    for (const t of tokens) {
      if (t.range.start.line === line) {
        if (t.range.start.column <= column && t.range.end.column > column) {
          return t.range.start.offset;
        }
      }
    }
    return -1;
  }

  return {
    tokens,

    at(line: number, column: number): Token | null {
      for (const t of tokens) {
        if (contains(t, line, column)) return t;
      }
      return null;
    },

    before(line: number, column: number): Token | null {
      let best: Token | null = null;
      for (const t of tokens) {
        if (
          t.range.end.line < line ||
          (t.range.end.line === line && t.range.end.column <= column)
        ) {
          // Skip whitespace and newline tokens — usually not what callers want.
          if (t.kind === 'whitespace' || t.kind === 'newline') continue;
          best = t;
        } else {
          break;
        }
      }
      return best;
    },
  };
}

function contains(t: Token, line: number, column: number): boolean {
  const { start, end } = t.range;
  if (line < start.line || line > end.line) return false;
  if (line === start.line && column < start.column) return false;
  if (line === end.line && column >= end.column) return false;
  return true;
}
