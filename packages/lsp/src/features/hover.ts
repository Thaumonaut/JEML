/**
 * Hover provider — when the user hovers over a token, show documentation.
 *
 * Strategy:
 *   - Find the token at the cursor
 *   - Classify it: sigil, tag, attribute, variant, reference, value
 *   - Build a markdown hover response from the relevant data source
 */

import { Hover, MarkupKind, Position } from 'vscode-languageserver/node';

import { Token, TokenIndex, Range as TokenRange } from '../parser/tokens';
import { lookupSigil } from '../data/sigils';
import { lookupTag } from '../data/tags';
import { lookupAttribute } from '../data/attributes';

export interface HoverContext {
  index: TokenIndex;
  line: number;
  column: number;
}

export function computeHover(ctx: HoverContext): Hover | null {
  const tok = ctx.index.at(ctx.line, ctx.column);
  if (!tok) return null;

  const range = toLspRange(tok.range);

  // ─────── Sigils ───────
  const sigilTokens: Record<string, string> = {
    'directive-open': '>>',
    'directive-close': '<<',
    'block-open': '>',
    'block-close': '<',
    'inline-open': '/>',
    'inline-close': '</',
    'void-marker': '!>',
    'content-delim': ':',
    'variant-dot': '.',
    'responsive-caret': '^',
    'flow-close': '~<',
    'sibling-marker': '-',
  };

  const sigilText = sigilTokens[tok.kind];
  if (sigilText) {
    const doc = lookupSigil(sigilText);
    if (doc) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**\`${sigilText}\`** — ${doc.name}\n\n${doc.description}\n\n_Spec: ${doc.specSection}_`,
        },
        range,
      };
    }
  }

  // ─────── Tag name ───────
  if (tok.kind === 'tag-name') {
    const tag = lookupTag(tok.text);
    if (tag) {
      const variantList =
        tag.variants.length > 0
          ? '\n\n**Variants:** ' + tag.variants.map(v => `\`.${v.name}\``).join(', ')
          : '';
      const attrList =
        tag.attributes.length > 0
          ? '\n\n**Attributes:** ' + tag.attributes.map(a => `\`${a}\``).join(', ')
          : '';
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value:
            `**\`${tag.name}\`** — ${tag.flavor} element\n\n` +
            `${tag.description}\n\n` +
            `**Compiles to:** \`${tag.htmlMapping}\`` +
            variantList +
            attrList +
            (tag.specSection ? `\n\n_Spec: ${tag.specSection}_` : ''),
        },
        range,
      };
    }
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `\`${tok.text}\` — unknown tag. If this is a user component, imports are handled via \`>> import\`.`,
      },
      range,
    };
  }

  // ─────── Variant name ───────
  if (tok.kind === 'variant-name') {
    // Find the tag this variant belongs to
    const tagTok = precedingTag(ctx.index.tokens, tok);
    if (tagTok) {
      const tag = lookupTag(tagTok.text);
      const variant = tag?.variants.find(v => v.name === tok.text);
      if (variant) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value:
              `**\`.${variant.name}\`** variant of \`${tag!.name}\`\n\n` +
              variant.description +
              (variant.emits ? `\n\n**Emits:** \`${variant.emits}\`` : ''),
          },
          range,
        };
      }
    }
  }

  // ─────── Attribute name ───────
  if (tok.kind === 'attr-name') {
    const attr = lookupAttribute(tok.text);
    if (attr) {
      const enumList =
        attr.enumValues && attr.enumValues.length > 0
          ? '\n\n**Values:** ' + attr.enumValues.map(v => `\`${v}\``).join(', ')
          : '';
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value:
            `**\`${attr.name}\`** — ${attr.class} attribute\n\n` +
            attr.description +
            `\n\n**Accepts:** ${attr.accepts.join(' | ')}` +
            (attr.responsive ? '\n\n✓ Supports responsive overrides' : '') +
            enumList +
            (attr.specSection ? `\n\n_Spec: ${attr.specSection}_` : ''),
        },
        range,
      };
    }
  }

  // ─────── References ───────
  if (tok.kind === 'var-ref') {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${tok.text}** — variable reference\n\nReads a reactive value from the \`>> script\` section.`,
      },
      range,
    };
  }
  if (tok.kind === 'handler-ref') {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${tok.text}** — handler reference\n\nReferences a function in the \`>> script\` section. Typically passed to event attributes like \`on_press\`.`,
      },
      range,
    };
  }
  if (tok.kind === 'iter-ref') {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${tok.text}** — loop iterator\n\nLoop-bound variable, scoped to the enclosing \`~ for\` body.`,
      },
      range,
    };
  }

  // ─────── CSS length ───────
  if (tok.kind === 'css-length') {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `\`${tok.text}\` — CSS length value.`,
      },
      range,
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────

function precedingTag(tokens: Token[], variantTok: Token): Token | null {
  const idx = tokens.indexOf(variantTok);
  for (let i = idx - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === 'tag-name') return t;
    if (t.kind === 'variant-name' || t.kind === 'variant-dot') continue;
    return null;
  }
  return null;
}

function toLspRange(r: TokenRange) {
  return {
    start: { line: r.start.line, character: r.start.column },
    end: { line: r.end.line, character: r.end.column },
  };
}
