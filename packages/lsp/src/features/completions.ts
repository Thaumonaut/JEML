/**
 * Completions — suggest tag names, variants, attributes, and enum values
 * based on the context at the cursor position.
 *
 * Completion contexts we handle:
 *   - After a structural sigil (>, />, !>, >>) and whitespace → tag names
 *     filtered by flavor
 *   - After a tag name and '.' → variants valid for that tag
 *   - After '[' or a comma-like delimiter inside brackets → attribute names
 *     valid for the enclosing tag
 *   - After an '=' inside brackets → values for that attribute (enum values
 *     if applicable)
 *   - After '&' → variables from script section (stub for v1)
 *   - After '@' → handlers from script section (stub for v1)
 */

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
} from 'vscode-languageserver/node';

import { Token, TokenIndex } from '../parser/tokens';
import { TAGS, lookupTag, TagDefinition, tagsForFlavor } from '../data/tags';
import { ATTRIBUTES, lookupAttribute } from '../data/attributes';

export interface CompletionContext {
  index: TokenIndex;
  /** 0-indexed line */
  line: number;
  /** 0-indexed column */
  column: number;
  /** The full source text, for precise contextual decisions */
  source: string;
}

export function computeCompletions(ctx: CompletionContext): CompletionItem[] {
  const prev = ctx.index.before(ctx.line, ctx.column);

  // Special case: if cursor is right after '.' but the dot wasn't tokenized
  // as variant-dot (because nothing followed it at tokenize-time), check the
  // source directly for the tag-name.cursor pattern.
  if (isVariantDotContext(ctx)) {
    const tagName = findTagBeforeDot(ctx);
    if (tagName) {
      return variantCompletions(tagName);
    }
  }

  if (!prev) {
    // Beginning of file — suggest directive openers
    return [
      ...rootDirectiveCompletions(),
    ];
  }

  // Context: just typed a structural sigil → tag name completion
  if (
    prev.kind === 'block-open' ||
    prev.kind === 'inline-open' ||
    prev.kind === 'void-marker' ||
    prev.kind === 'directive-open'
  ) {
    const flavor =
      prev.kind === 'block-open' ? 'block' :
      prev.kind === 'inline-open' ? 'inline' :
      prev.kind === 'void-marker' ? 'void' :
      'block'; // directive-open — use block catalog, actual directives handled in rootDirective
    if (prev.kind === 'directive-open') {
      return directiveTagCompletions();
    }
    return tagNameCompletions(flavor);
  }

  // Context: just typed a variant dot → variant completion for the preceding tag
  if (prev.kind === 'variant-dot') {
    const tagTok = findPrecedingTag(ctx.index.tokens, prev);
    if (tagTok) {
      return variantCompletions(tagTok.text);
    }
    return [];
  }

  // Context: inside an attribute list
  //   - After [: attribute names
  //   - After attr-name: '=' hint (not useful, suggest values via `=` trigger)
  //   - After =: attribute values
  const inBrackets = withinAttributeList(ctx.index.tokens, prev);
  if (inBrackets) {
    if (prev.kind === 'attr-bracket-open' || prev.kind === 'whitespace' || prev.kind === 'string-quoted' ||
        prev.kind === 'number' || prev.kind === 'boolean' || prev.kind === 'identifier' || prev.kind === 'css-length') {
      // Attribute name completion — find the owning tag first
      const tagTok = findTagForBracket(ctx.index.tokens, inBrackets);
      if (tagTok) {
        return attributeNameCompletions(tagTok.text);
      }
      // No tag known — return all attributes as a fallback
      return ATTRIBUTES.map(a => ({
        label: a.name,
        kind: CompletionItemKind.Property,
        detail: a.class + ' attribute',
        documentation: { kind: 'markdown' as const, value: a.description },
      }));
    }
    if (prev.kind === 'attr-eq') {
      // Attribute value completion — find what attribute we're setting
      const attrNameTok = findOwningAttributeName(ctx.index.tokens, prev);
      if (attrNameTok) {
        return attributeValueCompletions(attrNameTok.text);
      }
      return [];
    }
  }

  // Reference sigils (stub for v1)
  if (prev.kind === 'var-ref' || prev.kind === 'handler-ref' || prev.kind === 'iter-ref') {
    return []; // In v2, surface names from parsed script section
  }

  return [];
}

// ─────────────────────────────────────────────────────
// Completion builders
// ─────────────────────────────────────────────────────

function rootDirectiveCompletions(): CompletionItem[] {
  return [
    {
      label: '>> meta',
      kind: CompletionItemKind.Keyword,
      detail: 'Document metadata directive',
      insertText: '>> meta [\n  title="${1:Page title}"\n  description="${2:Description}"\n]\n$0',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: '>> document',
      kind: CompletionItemKind.Keyword,
      detail: 'Markup tree',
      insertText: '>> document:\n  $0\n<< document',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: '>> style',
      kind: CompletionItemKind.Keyword,
      detail: 'Stylesheet directive',
      insertText: '>> style [type=css ref="${1:/styles/main.css}"]\n$0',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: '>> import',
      kind: CompletionItemKind.Keyword,
      detail: 'Import a component or module',
      insertText: '>> import [from="${1:./component.jot}"]: ${2:Name}\n$0',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: '>> script',
      kind: CompletionItemKind.Keyword,
      detail: 'Reactive script',
      insertText: '>> script: {\n  $0\n}',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: '>> component',
      kind: CompletionItemKind.Keyword,
      detail: 'solid-jotlang component declaration',
      insertText:
        '>> component ${1:Name}:\n  >> props: {\n    $2\n  }\n\n  >> script: {\n    $3\n  }\n\n  >> document:\n    $0\n  << document\n<< component',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: '>> props',
      kind: CompletionItemKind.Keyword,
      detail: 'Typed component props (solid-jotlang)',
      insertText: '>> props: {\n  $0\n}',
      insertTextFormat: InsertTextFormat.Snippet,
    },
  ];
}

function directiveTagCompletions(): CompletionItem[] {
  return ['meta', 'style', 'import', 'document', 'script', 'component', 'props'].map(name => ({
    label: name,
    kind: CompletionItemKind.Keyword,
    detail: `${name} directive`,
  }));
}

function tagNameCompletions(flavor: 'block' | 'inline' | 'void'): CompletionItem[] {
  return tagsForFlavor(flavor).map(t => ({
    label: t.name,
    kind: CompletionItemKind.Class,
    detail: `${t.htmlMapping} (${t.flavor === 'any' ? 'block/inline/void' : t.flavor})`,
    documentation: { kind: 'markdown', value: t.description },
  }));
}

function variantCompletions(tagName: string): CompletionItem[] {
  const tag = lookupTag(tagName);
  if (!tag) return [];
  return tag.variants.map(v => ({
    label: v.name,
    kind: CompletionItemKind.EnumMember,
    detail: v.emits ?? '',
    documentation: { kind: 'markdown', value: v.description },
  }));
}

function attributeNameCompletions(tagName: string): CompletionItem[] {
  const tag = lookupTag(tagName);
  const tagAttrs = tag ? tag.attributes : [];
  const tagAttrDefs = tagAttrs
    .map(n => lookupAttribute(n))
    .filter((a): a is NonNullable<typeof a> => a !== null);

  // Include global-ish attributes too (id, key)
  const globalAttrDefs = ATTRIBUTES.filter(a => a.name === 'id' || a.name === 'key');

  const seen = new Set<string>();
  const combined = [...tagAttrDefs, ...globalAttrDefs].filter(a => {
    if (seen.has(a.name)) return false;
    seen.add(a.name);
    return true;
  });

  return combined.map(a => ({
    label: a.name,
    kind: CompletionItemKind.Property,
    detail: `${a.class} — ${a.accepts.join('|')}${a.responsive ? ' (responsive)' : ''}`,
    documentation: { kind: 'markdown', value: a.description },
    insertText: `${a.name}=`,
  }));
}

function attributeValueCompletions(attrName: string): CompletionItem[] {
  const attr = lookupAttribute(attrName);
  if (!attr || !attr.enumValues) return [];

  return attr.enumValues.map(v => ({
    label: v,
    kind: CompletionItemKind.Value,
    detail: `${attrName} value`,
  }));
}

// ─────────────────────────────────────────────────────
// Context helpers
// ─────────────────────────────────────────────────────

/**
 * If the cursor is inside an `[...]` attribute list, return the opening bracket
 * token. Returns null if not inside brackets.
 */
function withinAttributeList(tokens: Token[], before: Token): Token | null {
  // Walk back from `before` — find the most recent unclosed '['
  let depth = 0;
  for (let i = indexOf(tokens, before); i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === 'attr-bracket-close') depth++;
    else if (t.kind === 'attr-bracket-open') {
      if (depth === 0) return t;
      depth--;
    }
  }
  return null;
}

function findTagForBracket(tokens: Token[], bracketOpen: Token): Token | null {
  // The tag owning this attribute list is the most recent tag-name before '['.
  const idx = indexOf(tokens, bracketOpen);
  for (let i = idx - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === 'tag-name') return t;
    // Stop if we hit another structural sigil without finding a tag
    if (
      t.kind === 'block-open' ||
      t.kind === 'block-close' ||
      t.kind === 'directive-open' ||
      t.kind === 'directive-close'
    ) {
      // We're past a tag boundary without finding a name — bail
      return null;
    }
  }
  return null;
}

function findPrecedingTag(tokens: Token[], reference: Token): Token | null {
  const idx = indexOf(tokens, reference);
  for (let i = idx - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === 'tag-name' || t.kind === 'variant-name') {
      // If it's a variant name, keep walking back to find the actual tag
      if (t.kind === 'variant-name') continue;
      return t;
    }
    if (t.kind === 'whitespace' || t.kind === 'variant-dot') continue;
    return null;
  }
  return null;
}

function findOwningAttributeName(tokens: Token[], eqToken: Token): Token | null {
  const idx = indexOf(tokens, eqToken);
  // The attribute name is the most recent attr-name or identifier before the =
  for (let i = idx - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === 'attr-name' || t.kind === 'identifier') return t;
    if (t.kind === 'whitespace') continue;
    return null;
  }
  return null;
}

function indexOf(tokens: Token[], needle: Token): number {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === needle) return i;
  }
  return -1;
}

/**
 * Detect the case where the user has typed `tag.` and the cursor is right
 * after the dot. At tokenize-time the '.' may not have been recognized as a
 * variant-dot because nothing follows it yet — so we check the source.
 */
function isVariantDotContext(ctx: CompletionContext): boolean {
  const { line, column, source } = ctx;
  const lines = source.split('\n');
  if (line < 0 || line >= lines.length) return false;
  const lineText = lines[line];
  // Character just before cursor
  if (column === 0) return false;
  return lineText[column - 1] === '.';
}

/**
 * Given a `tag.` context, extract the tag name that precedes the dot.
 */
function findTagBeforeDot(ctx: CompletionContext): string | null {
  const { line, column, source } = ctx;
  const lines = source.split('\n');
  const lineText = lines[line];
  // Walk back from column-2 collecting ident chars
  let i = column - 2;
  const chars: string[] = [];
  while (i >= 0 && /[a-zA-Z0-9_-]/.test(lineText[i])) {
    chars.unshift(lineText[i]);
    i--;
  }
  const word = chars.join('');
  if (!word) return null;

  // Verify the char before the word is a structural opener (might be preceded
  // by whitespace).
  while (i >= 0 && lineText[i] === ' ') i--;
  // Valid openers: >, />, !>, previous line's last token (too complex for now)
  if (i < 0) return word; // Beginning of line — accept
  const ch = lineText[i];
  if (ch === '>' || ch === '!') return word;
  // Accept if we're in a `.foo.bar` chain (variant stacking)
  if (ch === '.') return word;
  return word; // Default to accepting — the tag lookup will filter invalid
}
