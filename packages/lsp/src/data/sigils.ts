/**
 * Sigil documentation for hover tooltips.
 *
 * Each entry describes what a sigil does, where it's valid, and links to the
 * relevant spec section in spec/RULEBOOK.md.
 *
 * These are exact-match lookups — when the user hovers over a token, we check
 * if it's in this table and return the documentation.
 */

export interface SigilDoc {
  /** The sigil characters themselves */
  sigil: string;
  /** Short name, e.g. "directive open" */
  name: string;
  /** Markdown description for the hover tooltip */
  description: string;
  /** Spec section reference */
  specSection: string;
}

export const SIGILS: Record<string, SigilDoc> = {
  '>>': {
    sigil: '>>',
    name: 'directive open',
    description:
      '**Directive open sigil.**\n\n' +
      'Opens a document-level section. Directives include `meta`, `style`, ' +
      '`import`, `document`, and `script`. Paired with `<<` for directives ' +
      'that have a body, or terminated at end of line for directives that ' +
      "don't (like `>> meta [...]`).",
    specSection: '§5.1',
  },
  '<<': {
    sigil: '<<',
    name: 'directive close',
    description:
      '**Directive close sigil.**\n\n' +
      'Closes a directive opened with `>>`. Can optionally include the ' +
      'directive name for clarity: `<< document`.',
    specSection: '§5.1',
  },
  '>': {
    sigil: '>',
    name: 'block open',
    description:
      '**Block element open sigil.**\n\n' +
      'Opens a multi-line block element. Must be followed by a tag name, ' +
      'optional variants (`.name`), optional attributes `[...]`, then `:` to ' +
      'begin content.',
    specSection: '§5.2',
  },
  '<': {
    sigil: '<',
    name: 'block close',
    description:
      '**Block element close sigil.**\n\n' +
      'Closes a block element opened with `>`. Can optionally include the ' +
      'tag name for clarity: `< section`.',
    specSection: '§5.2',
  },
  '/>': {
    sigil: '/>',
    name: 'inline open',
    description:
      '**Inline element open sigil.**\n\n' +
      'Opens an inline element that stays on a single line within text flow. ' +
      'Paired with `</`. Use for elements like `strong`, `em`, `span`, `code`.',
    specSection: '§5.3',
  },
  '</': {
    sigil: '</',
    name: 'inline close',
    description:
      '**Inline element close sigil.**\n\n' +
      'Closes an inline element opened with `/>`.',
    specSection: '§5.3',
  },
  '!>': {
    sigil: '!>',
    name: 'void element',
    description:
      '**Void element sigil.**\n\n' +
      'A self-contained element with no body and no closing tag. Carries all ' +
      'its information in attributes. Used for `image`, `field`, `break`, ' +
      '`divider`, `spacer`, `icon`.\n\nExample: `!> field [type=email label="Email"]`',
    specSection: '§5.4',
  },
  ':': {
    sigil: ':',
    name: 'content delimiter',
    description:
      '**Content delimiter.**\n\n' +
      'Mandatory character that separates tag declaration from content. ' +
      'Every element with content uses `:`, whether block, inline, or directive. ' +
      'The compiler uses this as the unambiguous signal that the tag header is ' +
      'complete.',
    specSection: '§5.5',
  },
  '.': {
    sigil: '.',
    name: 'variant separator',
    description:
      '**Variant separator.**\n\n' +
      'Attaches a variant to a tag name. Variants are enumerated sub-types: ' +
      '`heading.1`, `button.primary`, `card.elevated`. Each tag has a fixed ' +
      'list of allowed variants. Variants can stack: `button.primary.lg`.',
    specSection: '§7.5',
  },
  '&': {
    sigil: '&',
    name: 'variable reference',
    description:
      '**Variable reference sigil.**\n\n' +
      'References a value declared in the `>> script` section. Reactive — ' +
      'changes to the underlying variable trigger re-render.\n\n' +
      'Example: `> heading.1: Hello, &username <`',
    specSection: '§10.1',
  },
  '@': {
    sigil: '@',
    name: 'handler reference',
    description:
      '**Handler reference sigil.**\n\n' +
      'References a function declared in the `>> script` section. Pass by ' +
      'reference to event attributes like `on_press`.\n\n' +
      'Example: `> button [on_press=@increment]: Add one <`',
    specSection: '§10.2',
  },
  '$': {
    sigil: '$',
    name: 'iterator reference',
    description:
      '**Iterator reference sigil.**\n\n' +
      'References a loop-bound variable inside a `~ for` loop body. Scoped to ' +
      'the loop — not accessible outside.\n\n' +
      'Example: `~ for (&users as $user)`',
    specSection: '§10.3',
  },
  '^': {
    sigil: '^',
    name: 'responsive override',
    description:
      '**Responsive override sigil.**\n\n' +
      'Attaches a breakpoint-conditional value to an attribute. Mobile-first: ' +
      'the base value applies below the breakpoint, the override applies at and ' +
      'above.\n\n' +
      'Example: `cols=1 ^(768px)=2 ^(1024px)=4`',
    specSection: '§8.6',
  },
  '~': {
    sigil: '~',
    name: 'control flow',
    description:
      '**Control flow sigil.**\n\n' +
      'Introduces control flow constructs: `~ for`, `~ if`, `~ else`. Paired ' +
      'with `~<` as the closing marker.',
    specSection: '§11',
  },
  '~<': {
    sigil: '~<',
    name: 'control flow close',
    description:
      '**Control flow close sigil.**\n\n' +
      'Closes a `~ for`, `~ if`, or `~ else` block.',
    specSection: '§11',
  },
  '%': {
    sigil: '%',
    name: 'line comment',
    description:
      '**Line comment sigil.**\n\n' +
      'Everything from `%` to end of line is a comment. Stripped at compile time.',
    specSection: '§13',
  },
  '%{': {
    sigil: '%{',
    name: 'block comment open',
    description:
      '**Block comment open.**\n\n' +
      'Opens a multi-line block comment. Closed with `%}`. Does not nest.',
    specSection: '§13',
  },
  '%}': {
    sigil: '%}',
    name: 'block comment close',
    description: '**Block comment close.**\n\nCloses a `%{` block comment.',
    specSection: '§13',
  },
  '-': {
    sigil: '-',
    name: 'sibling marker',
    description:
      '**Sibling item marker.**\n\n' +
      'Marks items in a list, cells in a table row, or entries in a navigation ' +
      "links block. Positioned at the start of a line with consistent indent.",
    specSection: '§6',
  },
  '#': {
    sigil: '#',
    name: 'link shorthand',
    description:
      '**Link shorthand.**\n\n' +
      "A compact form for inline links. Written as `#'text'[url=\"...\"]`.\n\n" +
      "Example: `Read the #'docs'[url=\"/docs\"] for details.`",
    specSection: '§9.1',
  },
  '\\': {
    sigil: '\\',
    name: 'escape',
    description:
      '**Escape character.**\n\n' +
      'Escapes the next character so it is treated literally. Useful for ' +
      'including sigils in content: `\\*`, `\\&`, `\\_`, `\\>`.',
    specSection: '§13.3',
  },
};

/**
 * Look up a sigil's documentation. Returns null if not a known sigil.
 */
export function lookupSigil(text: string): SigilDoc | null {
  return SIGILS[text] ?? null;
}
