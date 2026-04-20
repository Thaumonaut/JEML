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

/**
 * solid-jotlang reactivity primitives. These appear inside `>> script: { ... }`
 * bodies where the LSP tokenizer treats their names as bare identifiers — we
 * surface a hover doc so users get inline reference material without leaving
 * the file.
 */
const REACTIVITY_PRIMITIVES: Record<string, string> = {
  signal:
    '**`signal(initial)`** — solid-jotlang reactive primitive\n\n' +
    'Declares a reactive value. Inside a `>> script:` body, assignments to a `signal()`-declared name compile to setter calls and reads compile to getter calls.\n\n' +
    '```ts\nlet count = signal(0)\ncount = count() + 1   // setter\nconsole.log(count())  // getter\n```',
  memo:
    '**`memo(() => expr)`** — solid-jotlang reactive primitive\n\n' +
    'Declares a derived value that recomputes only when its dependencies change. Compiles to Solid\'s `createMemo`.',
  effect:
    '**`effect(() => { ... })`** — solid-jotlang reactive primitive\n\n' +
    'Runs a side-effect that re-runs whenever any reactive value it reads changes. Compiles to Solid\'s `createEffect`.',
  resource:
    '**`resource(fetcher)`** — solid-jotlang reactive primitive\n\n' +
    'Declares an async resource (e.g. for `fetch`). Tracks loading state and re-fetches when its source signal changes. Compiles to Solid\'s `createResource`.',
  onMount:
    '**`onMount(() => { ... })`** — Solid lifecycle\n\n' +
    'Runs once after the component mounts to the DOM. Re-exported from `solid-js`.',
  onCleanup:
    '**`onCleanup(() => { ... })`** — Solid lifecycle\n\n' +
    'Runs when the component (or current reactive scope) is disposed. Re-exported from `solid-js`.',
  props:
    '**`props`** — component props object\n\n' +
    'Inside a `>> component`, the typed object declared by `>> props: { ... }`. Access fields as `props.name`. Solid props are getters — destructuring breaks reactivity.',
};

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

  // ─────── solid-jotlang reactivity primitives (inside script bodies) ───────
  // These tokenize as bare identifiers because the LSP tokenizer treats script
  // bodies as opaque content. We surface a hover doc when the identifier name
  // matches a known primitive.
  if (tok.kind === 'identifier') {
    const doc = REACTIVITY_PRIMITIVES[tok.text];
    if (doc) {
      return {
        contents: { kind: MarkupKind.Markdown, value: doc },
        range,
      };
    }
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
