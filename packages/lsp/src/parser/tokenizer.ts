/**
 * JEML tokenizer for LSP purposes.
 *
 * Character-stream tokenizer that produces a flat stream of tokens with
 * position information. This is NOT the compiler's parser — it's a simpler
 * pass that's sufficient for hover/completion and for cheap structural
 * diagnostics (unclosed blocks, unknown tags, etc.).
 *
 * Design tradeoffs:
 * - Permissive by default. Invalid input produces tokens of kind `unknown`
 *   rather than stopping, because the LSP must still help users while they
 *   type partial code.
 * - Line-aware. Comments, newlines, and indentation are preserved so that
 *   structural heuristics can detect unclosed blocks by looking at
 *   open/close counts line by line.
 * - No semantic validation. Whether a tag is known, whether an attribute
 *   is valid for the tag, etc. — those are concerns for the diagnostic
 *   and completion providers that consume this output.
 */

import { Token, TokenKind, TokenizeResult, TokenError, Position, Range } from './tokens';

const IDENT_START = /[a-zA-Z_]/;
const IDENT_CONT = /[a-zA-Z0-9_-]/;
const DIGIT = /[0-9]/;
const LENGTH_UNIT = /^(px|rem|em|%|vh|vw|pt|ch|ex|fr)$/;

export function tokenize(source: string): TokenizeResult {
  const tokens: Token[] = [];
  const errors: TokenError[] = [];

  let offset = 0;
  let line = 0;
  let column = 0;

  // Mode tracking for context-sensitive classification.
  // - 'attr-list' while inside [...]
  // - 'responsive' while inside ^(...)
  // - 'content' the default
  const modeStack: Array<'content' | 'attr-list' | 'responsive'> = ['content'];
  const mode = () => modeStack[modeStack.length - 1];

  const pos = (): Position => ({ line, column, offset });

  const advance = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      const ch = source[offset];
      if (ch === '\n') {
        line++;
        column = 0;
      } else {
        column++;
      }
      offset++;
    }
  };

  const peek = (n = 0): string => source[offset + n] ?? '';
  const peekStr = (n: number): string => source.substr(offset, n);

  const emit = (kind: TokenKind, start: Position, text: string): void => {
    tokens.push({
      kind,
      text,
      range: { start, end: pos() },
    });
  };

  const error = (message: string, start: Position): void => {
    errors.push({
      message,
      range: { start, end: pos() },
      severity: 'error',
    });
  };

  // ─────────────────────────────────────────────────────
  // Main scanning loop
  // ─────────────────────────────────────────────────────
  while (offset < source.length) {
    const start = pos();
    const ch = peek();

    // Newline
    if (ch === '\n') {
      advance();
      emit('newline', start, '\n');
      continue;
    }

    // Whitespace (spaces, tabs — not newlines)
    if (ch === ' ' || ch === '\t') {
      while (peek() === ' ' || peek() === '\t') advance();
      emit('whitespace', start, source.slice(start.offset, offset));
      continue;
    }

    // ─────── Comments ───────
    if (ch === '%' && peek(1) === '{') {
      // Block comment — scan until %}
      advance(2);
      while (offset < source.length && !(peek() === '%' && peek(1) === '}')) {
        advance();
      }
      if (offset < source.length) advance(2);
      else error('Unterminated block comment', start);
      emit('block-comment', start, source.slice(start.offset, offset));
      continue;
    }
    if (ch === '%') {
      // Line comment — to end of line
      while (offset < source.length && peek() !== '\n') advance();
      emit('line-comment', start, source.slice(start.offset, offset));
      continue;
    }

    // ─────── Fenced code block ───────
    if (ch === '`' && peek(1) === '`' && peek(2) === '`') {
      advance(3);
      // Scan until closing ```
      while (offset < source.length) {
        if (peek() === '`' && peek(1) === '`' && peek(2) === '`') {
          advance(3);
          break;
        }
        advance();
      }
      emit('fenced-code', start, source.slice(start.offset, offset));
      continue;
    }

    // ─────── Structural sigils ───────
    if (ch === '>' && peek(1) === '>') {
      advance(2);
      emit('directive-open', start, '>>');
      continue;
    }
    if (ch === '<' && peek(1) === '<') {
      advance(2);
      emit('directive-close', start, '<<');
      continue;
    }
    if (ch === '/' && peek(1) === '>') {
      advance(2);
      emit('inline-open', start, '/>');
      continue;
    }
    if (ch === '<' && peek(1) === '/') {
      advance(2);
      emit('inline-close', start, '</');
      continue;
    }
    if (ch === '!' && peek(1) === '>') {
      advance(2);
      emit('void-marker', start, '!>');
      continue;
    }
    if (ch === '~' && peek(1) === '<') {
      advance(2);
      emit('flow-close', start, '~<');
      continue;
    }
    if (ch === '>') {
      advance();
      emit('block-open', start, '>');
      continue;
    }
    if (ch === '<') {
      advance();
      emit('block-close', start, '<');
      continue;
    }

    // ─────── Attribute brackets ───────
    if (ch === '[') {
      advance();
      modeStack.push('attr-list');
      emit('attr-bracket-open', start, '[');
      continue;
    }
    if (ch === ']') {
      advance();
      if (mode() === 'attr-list') modeStack.pop();
      emit('attr-bracket-close', start, ']');
      continue;
    }
    if (ch === '=') {
      advance();
      emit('attr-eq', start, '=');
      continue;
    }

    // Responsive override caret
    if (ch === '^') {
      advance();
      emit('responsive-caret', start, '^');
      continue;
    }

    // Parens — only meaningful in attr-list mode right after ^ (responsive)
    // or in responsive mode to close. In content mode they're plain text.
    if (ch === '(' && (mode() === 'attr-list' || mode() === 'responsive')) {
      // Check if previous non-whitespace was ^
      const prev = lastNonWhitespace(tokens);
      if (prev && prev.kind === 'responsive-caret') {
        advance();
        modeStack.push('responsive');
        emit('responsive-open', start, '(');
        continue;
      }
    }
    if (ch === ')' && mode() === 'responsive') {
      advance();
      modeStack.pop();
      emit('responsive-close', start, ')');
      continue;
    }

    // ─────── Content delimiter ───────
    if (ch === ':') {
      advance();
      emit('content-delim', start, ':');
      continue;
    }

    // ─────── Variant dot ───────
    // A '.' following a tag-name or variant-name, and followed by an
    // identifier-like character (including digits, for heading.1 etc.),
    // is a variant separator.
    if (ch === '.' && tokens.length > 0) {
      const prev = lastNonWhitespace(tokens);
      const prevEndsIdent =
        prev && (prev.kind === 'tag-name' || prev.kind === 'variant-name');
      const next1 = peek(1);
      const nextStartsVariant = /[a-zA-Z0-9_]/.test(next1);
      if (prevEndsIdent && nextStartsVariant) {
        advance();
        emit('variant-dot', start, '.');
        // Read the variant name (allow digits or ident chars)
        const varStart = pos();
        while (offset < source.length && /[a-zA-Z0-9_-]/.test(peek())) advance();
        emit('variant-name', varStart, source.slice(varStart.offset, offset));
        continue;
      }
    }

    // ─────── Reference sigils ───────
    if (ch === '&' && IDENT_START.test(peek(1))) {
      advance();
      while (offset < source.length && (IDENT_CONT.test(peek()) || peek() === '.')) advance();
      emit('var-ref', start, source.slice(start.offset, offset));
      continue;
    }
    if (ch === '@' && IDENT_START.test(peek(1))) {
      advance();
      while (offset < source.length && (IDENT_CONT.test(peek()) || peek() === '.')) advance();
      emit('handler-ref', start, source.slice(start.offset, offset));
      continue;
    }
    if (ch === '$' && IDENT_START.test(peek(1))) {
      advance();
      while (offset < source.length && (IDENT_CONT.test(peek()) || peek() === '.')) advance();
      emit('iter-ref', start, source.slice(start.offset, offset));
      continue;
    }

    // ─────── Strings ───────
    if (ch === '"') {
      advance();
      const strStart = start;
      while (offset < source.length && peek() !== '"' && peek() !== '\n') {
        if (peek() === '\\') advance(2);
        else advance();
      }
      if (peek() === '"') advance();
      else error('Unterminated string', strStart);
      emit('string-quoted', start, source.slice(start.offset, offset));
      continue;
    }

    // ─────── Escapes in content ───────
    if (ch === '\\') {
      advance(2);
      emit('escape', start, source.slice(start.offset, offset));
      continue;
    }

    // ─────── Sibling marker ───────
    // A '-' at the start of a line (possibly after whitespace) is a sibling
    // marker; mid-line it's just text.
    if (ch === '-' && isLineStart(tokens)) {
      advance();
      emit('sibling-marker', start, '-');
      continue;
    }

    // ─────── Link shorthand ───────
    // #'text'[...]
    if (ch === '#' && peek(1) === "'") {
      advance(2);
      while (offset < source.length && peek() !== "'" && peek() !== '\n') advance();
      if (peek() === "'") advance();
      // Optionally read the [...] part
      if (peek() === '[') {
        let depth = 1;
        advance();
        while (offset < source.length && depth > 0) {
          if (peek() === '[') depth++;
          else if (peek() === ']') depth--;
          if (depth > 0) advance();
        }
        if (peek() === ']') advance();
      }
      emit('link-shorthand', start, source.slice(start.offset, offset));
      continue;
    }

    // ─────── Control flow ───────
    if (ch === '~') {
      advance();
      // Skip whitespace after ~
      while (peek() === ' ' || peek() === '\t') advance();
      // Read keyword
      while (offset < source.length && IDENT_CONT.test(peek())) advance();
      emit('flow-keyword', start, source.slice(start.offset, offset));
      continue;
    }

    // ─────── Markdown-style inline sigils ───────
    if (ch === '*' && peek(1) === '*') {
      advance(2);
      while (offset < source.length && !(peek() === '*' && peek(1) === '*')) {
        if (peek() === '\n') break;
        advance();
      }
      if (peek() === '*' && peek(1) === '*') advance(2);
      emit('markdown-bold', start, source.slice(start.offset, offset));
      continue;
    }
    if (ch === '_' && !prevIsIdent(tokens)) {
      advance();
      while (offset < source.length && peek() !== '_' && peek() !== '\n') advance();
      if (peek() === '_') advance();
      emit('markdown-italic', start, source.slice(start.offset, offset));
      continue;
    }
    if (ch === '`') {
      advance();
      while (offset < source.length && peek() !== '`' && peek() !== '\n') advance();
      if (peek() === '`') advance();
      emit('markdown-code', start, source.slice(start.offset, offset));
      continue;
    }

    // ─────── Numbers and CSS lengths ───────
    if (DIGIT.test(ch) || (ch === '-' && DIGIT.test(peek(1)))) {
      const numStart = start;
      if (ch === '-') advance();
      while (offset < source.length && DIGIT.test(peek())) advance();
      if (peek() === '.' && DIGIT.test(peek(1))) {
        advance();
        while (offset < source.length && DIGIT.test(peek())) advance();
      }
      // Check for a length unit
      let unitStart = offset;
      while (offset < source.length && /[a-zA-Z%]/.test(peek())) advance();
      const unit = source.slice(unitStart, offset);
      const text = source.slice(numStart.offset, offset);
      if (unit && LENGTH_UNIT.test(unit)) {
        emit('css-length', numStart, text);
      } else if (unit === '') {
        emit('number', numStart, text);
      } else {
        // Unknown unit — emit as unknown
        emit('unknown', numStart, text);
      }
      continue;
    }

    // ─────── Identifiers / tag names / booleans ───────
    if (IDENT_START.test(ch)) {
      const identStart = start;
      while (offset < source.length && IDENT_CONT.test(peek())) advance();
      const text = source.slice(identStart.offset, offset);

      // Classify by context:
      //   - After >, >>, />, !>, <, </, <<: tag-name
      //   - Inside [...]: attr-name (after [ or =end-of-value) or identifier (after =)
      //   - true/false in attr-list: boolean
      //   - In content: identifier (will be mostly text-like)
      const kind = classifyIdentifier(text, tokens, mode());
      emit(kind, identStart, text);
      continue;
    }

    // ─────── Fallback: text content or unknown ───────
    // Anything else is treated as plain text. Group consecutive text characters.
    const textStart = start;
    while (offset < source.length && isTextChar(peek())) advance();
    if (offset > start.offset) {
      emit('text', textStart, source.slice(textStart.offset, offset));
    } else {
      // Safety: if we can't make progress, advance one to avoid infinite loop.
      advance();
      emit('unknown', start, source[start.offset] ?? '');
    }
  }

  return { tokens, errors };
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

function prevIsIdent(tokens: Token[]): boolean {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === 'whitespace' || t.kind === 'newline') continue;
    return (
      t.kind === 'tag-name' ||
      t.kind === 'identifier' ||
      t.kind === 'variant-name' ||
      t.kind === 'attr-name'
    );
  }
  return false;
}

function lastNonWhitespace(tokens: Token[]): Token | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === 'whitespace' || t.kind === 'newline') continue;
    return t;
  }
  return null;
}

function isLineStart(tokens: Token[]): boolean {
  // Walk backwards through tokens; if we hit a newline before any non-whitespace
  // token, we're at line start.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === 'whitespace') continue;
    if (t.kind === 'newline') return true;
    return false;
  }
  return true; // Beginning of file counts as line start.
}

function isTextChar(ch: string): boolean {
  // Characters that can appear in text content without triggering a sigil.
  return (
    ch !== '' &&
    ch !== '\n' &&
    ch !== '<' &&
    ch !== '>' &&
    ch !== '/' &&
    ch !== '!' &&
    ch !== '[' &&
    ch !== ']' &&
    ch !== '=' &&
    ch !== ':' &&
    ch !== '"' &&
    ch !== '&' &&
    ch !== '@' &&
    ch !== '$' &&
    ch !== '%' &&
    ch !== '^' &&
    ch !== '*' &&
    ch !== '_' &&
    ch !== '`' &&
    ch !== '#' &&
    ch !== '~' &&
    ch !== '\\' &&
    ch !== '-'
  );
}

function classifyIdentifier(
  text: string,
  tokens: Token[],
  currentMode: 'content' | 'attr-list' | 'responsive',
): TokenKind {
  // Look at the previous non-whitespace token to decide.
  let prev: Token | null = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === 'whitespace' || t.kind === 'newline') continue;
    prev = t;
    break;
  }

  // After a structural sigil → tag name. This takes precedence over everything.
  if (
    prev &&
    (prev.kind === 'directive-open' ||
      prev.kind === 'directive-close' ||
      prev.kind === 'block-open' ||
      prev.kind === 'block-close' ||
      prev.kind === 'inline-open' ||
      prev.kind === 'inline-close' ||
      prev.kind === 'void-marker')
  ) {
    return 'tag-name';
  }

  // true/false are boolean literals when they appear as values — in attr-list
  // mode, or after an = in any mode.
  if (text === 'true' || text === 'false') {
    if (currentMode === 'attr-list' || (prev && prev.kind === 'attr-eq')) {
      return 'boolean';
    }
  }

  // Inside attribute list:
  //   after [ or after a value-ending token → attr-name
  //   after = → identifier (attribute value, bare string)
  if (currentMode === 'attr-list') {
    if (prev) {
      if (prev.kind === 'attr-eq') return 'identifier';
      // After a complete value, a new identifier is a new attr-name
      if (
        prev.kind === 'attr-bracket-open' ||
        prev.kind === 'string-quoted' ||
        prev.kind === 'number' ||
        prev.kind === 'boolean' ||
        prev.kind === 'css-length' ||
        prev.kind === 'identifier' ||
        prev.kind === 'var-ref' ||
        prev.kind === 'handler-ref' ||
        prev.kind === 'responsive-close'
      ) {
        return 'attr-name';
      }
    }
    // Default inside brackets: attr-name
    return 'attr-name';
  }

  // In responsive mode we only expect lengths and numbers, not identifiers,
  // but if we see one, treat as identifier.
  if (currentMode === 'responsive') return 'identifier';

  // Content mode: plain identifier (effectively just text).
  // Note: in content, individual words tokenize separately, but the
  // diagnostic/hover layer treats them as opaque — not useful.
  return 'identifier';
}
