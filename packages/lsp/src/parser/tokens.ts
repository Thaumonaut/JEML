/**
 * Token types for the LSP-oriented tokenizer.
 *
 * This is a lightweight token model that supports position queries
 * ("what token is at line N, column M?") and structural analysis
 * ("is there an unclosed block?"). It is NOT a full parser — the
 * actual compiler uses the Peggy grammar for that.
 *
 * The two analyses serve different needs:
 *   - Peggy parser:  correct AST for HTML codegen
 *   - LSP tokenizer: per-character classification for hovering/completing
 *
 * We could reuse the Peggy parser by having it emit position metadata for
 * every node, and that's the long-term plan. For v1 of the LSP, a separate
 * lightweight tokenizer keeps the contract minimal and avoids coupling.
 */

export type TokenKind =
  // Structural sigils
  | 'directive-open'      // >>
  | 'directive-close'     // <<
  | 'block-open'          // >
  | 'block-close'         // <
  | 'inline-open'         // />
  | 'inline-close'        // </
  | 'void-marker'         // !>
  | 'content-delim'       // :
  | 'variant-dot'         // .

  // Attributes
  | 'attr-bracket-open'   // [
  | 'attr-bracket-close'  // ]
  | 'attr-eq'             // =
  | 'attr-name'           // identifier before =
  | 'responsive-caret'    // ^
  | 'responsive-open'     // (
  | 'responsive-close'    // )
  | 'breakpoint-value'    // value inside ^(...)

  // Names and values
  | 'tag-name'
  | 'variant-name'
  | 'string-quoted'
  | 'number'
  | 'boolean'
  | 'identifier'
  | 'css-length'

  // References
  | 'var-ref'             // &name
  | 'handler-ref'         // @name
  | 'iter-ref'            // $name

  // Text & markup
  | 'text'
  | 'markdown-bold'       // **text**
  | 'markdown-italic'     // _text_
  | 'markdown-code'       // `text`
  | 'link-shorthand'      // #'text'[...]

  // Control flow
  | 'flow-keyword'        // ~, ~ for, ~ if, ~ else
  | 'flow-close'          // ~<

  // Comments
  | 'line-comment'        // % ...
  | 'block-comment'       // %{ ... %}

  // Misc
  | 'sibling-marker'      // -
  | 'escape'              // \x
  | 'fenced-code'         // ```...```
  | 'whitespace'
  | 'newline'
  | 'unknown';

export interface Position {
  line: number;   // 0-indexed
  column: number; // 0-indexed
  offset: number; // absolute byte offset
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Token {
  kind: TokenKind;
  text: string;
  range: Range;
  /** For tags: any variants attached (.1, .primary). Populated by the structural pass. */
  variants?: string[];
  /** For attributes: the attribute name owning this value, if applicable */
  owningAttribute?: string;
}

export interface TokenizeResult {
  tokens: Token[];
  /** Errors encountered during tokenization (unclosed strings, etc.) */
  errors: TokenError[];
}

export interface TokenError {
  message: string;
  range: Range;
  severity: 'error' | 'warning';
}

/**
 * A snapshot of position-indexed token data, built after tokenization for fast
 * lookup. Used by hover and completion providers.
 */
export interface TokenIndex {
  /** All tokens in source order */
  tokens: Token[];
  /** Find the token at a given line/column. Returns null if between tokens. */
  at(line: number, column: number): Token | null;
  /** Find the token immediately before a given line/column. */
  before(line: number, column: number): Token | null;
}
