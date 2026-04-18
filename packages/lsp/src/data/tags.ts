/**
 * Tag registry — every tag JEML understands, what variants it accepts, what
 * attributes it takes, and what HTML it compiles to.
 *
 * This is the canonical source of truth for IDE assistance. The compiler's
 * code generator should also consume this data so it stays in sync.
 *
 * When adding a new tag:
 * 1. Add an entry here with the HTML mapping, valid variants, and attributes
 * 2. Update spec/ELEMENT_MAPPING.md to document the mapping
 * 3. Add a test in tests/examples/
 */

export type TagFlavor = 'block' | 'inline' | 'void' | 'any';

export interface TagVariant {
  name: string;
  description: string;
  /** The HTML class or tag transformation this variant applies */
  emits?: string;
}

export interface TagDefinition {
  /** The tag name as written in JEML */
  name: string;
  /** Which syntactic positions this tag accepts */
  flavor: TagFlavor;
  /** Short description for hover tooltips */
  description: string;
  /** The HTML element(s) this compiles to */
  htmlMapping: string;
  /** Valid variants for this tag. Empty array means no variants allowed. */
  variants: TagVariant[];
  /** Attribute names this tag recognizes. Global attributes (id, etc.) are
   *  not listed here — they're always valid. */
  attributes: string[];
  /** Spec section reference */
  specSection?: string;
}

export const TAGS: TagDefinition[] = [
  // ───────── Document structure ─────────
  {
    name: 'document',
    flavor: 'block',
    description: 'The root markup tree. Compiles to the HTML `<body>` element.',
    htmlMapping: '<body>...</body>',
    variants: [],
    attributes: [],
    specSection: '§5.1',
  },
  {
    name: 'meta',
    flavor: 'block',
    description:
      'Document metadata directive. Produces `<title>`, `<meta>`, and `<link rel="icon">` tags in the HTML head.',
    htmlMapping: 'elements inside <head>',
    variants: [],
    attributes: ['title', 'description', 'icon', 'scale', 'author', 'keywords', 'viewport'],
    specSection: '§5.1.1',
  },
  {
    name: 'style',
    flavor: 'block',
    description:
      'Stylesheet directive. Inline CSS in the body of the directive, or external via `ref`.',
    htmlMapping: '<link rel="stylesheet"> or <style>...</style>',
    variants: [],
    attributes: ['type', 'ref'],
    specSection: '§5.1.2',
  },
  {
    name: 'import',
    flavor: 'block',
    description: 'Imports components or utilities from another file.',
    htmlMapping: '(no HTML output — compile-time only)',
    variants: [],
    attributes: ['from'],
    specSection: '§5.1.3',
  },
  {
    name: 'script',
    flavor: 'block',
    description: 'Reactive state and event handlers. Body is code in the target language.',
    htmlMapping: 'compiled to runtime code',
    variants: [],
    attributes: ['type'],
    specSection: '§5.1.4',
  },

  // ───────── Block structure ─────────
  {
    name: 'section',
    flavor: 'block',
    description: 'A semantic page section.',
    htmlMapping: '<section>',
    variants: [],
    attributes: [],
  },
  {
    name: 'article',
    flavor: 'block',
    description: 'A self-contained article.',
    htmlMapping: '<article>',
    variants: [],
    attributes: [],
  },
  {
    name: 'aside',
    flavor: 'block',
    description: 'Sidebar or tangential content.',
    htmlMapping: '<aside>',
    variants: [],
    attributes: [],
  },
  {
    name: 'header',
    flavor: 'block',
    description: 'Page or section header.',
    htmlMapping: '<header>',
    variants: [],
    attributes: [],
  },
  {
    name: 'footer',
    flavor: 'block',
    description: 'Page or section footer.',
    htmlMapping: '<footer>',
    variants: [],
    attributes: [],
  },
  {
    name: 'main',
    flavor: 'block',
    description: 'Main content region.',
    htmlMapping: '<main>',
    variants: [],
    attributes: [],
  },

  // ───────── Headings ─────────
  {
    name: 'heading',
    flavor: 'block',
    description: 'A heading. Use variants `.1` through `.6` to set the level.',
    htmlMapping: '<h1> through <h6>',
    variants: [
      { name: '1', description: 'Level 1 heading', emits: '<h1>' },
      { name: '2', description: 'Level 2 heading', emits: '<h2>' },
      { name: '3', description: 'Level 3 heading', emits: '<h3>' },
      { name: '4', description: 'Level 4 heading', emits: '<h4>' },
      { name: '5', description: 'Level 5 heading', emits: '<h5>' },
      { name: '6', description: 'Level 6 heading', emits: '<h6>' },
    ],
    attributes: [],
    specSection: '§7.5.1',
  },

  // ───────── Text ─────────
  {
    name: 'text',
    flavor: 'block',
    description:
      'A paragraph of prose. Variants modify appearance without changing the underlying `<p>` element.',
    htmlMapping: '<p>',
    variants: [
      { name: 'lead', description: 'Larger, introductory paragraph', emits: 'class="lead"' },
      { name: 'muted', description: 'De-emphasized text', emits: 'class="muted"' },
      { name: 'caption', description: 'Small caption-style text', emits: 'class="caption"' },
    ],
    attributes: [],
  },

  // ───────── Lists ─────────
  {
    name: 'list',
    flavor: 'block',
    description:
      'A list of items. Use `-` sibling markers for each item. Variants control ordering and marker style.',
    htmlMapping: '<ul> or <ol>',
    variants: [
      { name: 'number', description: 'Numbered (ordered) list', emits: '<ol>' },
      { name: 'none', description: 'No bullets or numbers', emits: 'class="list-none"' },
    ],
    attributes: [],
  },

  // ───────── Navigation ─────────
  {
    name: 'nav',
    flavor: 'block',
    description: 'Navigation region. Typically contains `brand`, `links`, and actions.',
    htmlMapping: '<nav>',
    variants: [],
    attributes: [],
  },
  {
    name: 'brand',
    flavor: 'block',
    description: 'The brand/logo area within a `nav`.',
    htmlMapping: '<div class="jeml-brand">',
    variants: [],
    attributes: [],
  },
  {
    name: 'links',
    flavor: 'block',
    description: 'A set of navigation links. Use `-` sibling markers for each link.',
    htmlMapping: '<ul>',
    variants: [],
    attributes: [],
  },

  // ───────── Interactive ─────────
  {
    name: 'button',
    flavor: 'any',
    description: 'A clickable button.',
    htmlMapping: '<button>',
    variants: [
      { name: 'primary', description: 'Primary action button', emits: 'class="primary"' },
      { name: 'secondary', description: 'Secondary action button', emits: 'class="secondary"' },
      { name: 'ghost', description: 'Minimal/outlined button', emits: 'class="ghost"' },
      { name: 'danger', description: 'Destructive action button', emits: 'class="danger"' },
      { name: 'sm', description: 'Small size', emits: 'class="jeml-size-sm"' },
      { name: 'lg', description: 'Large size', emits: 'class="jeml-size-lg"' },
    ],
    attributes: ['type', 'disabled', 'on_press', 'title'],
  },
  {
    name: 'link',
    flavor: 'any',
    description: 'An anchor link. In block context, wraps child elements as a clickable region.',
    htmlMapping: '<a>',
    variants: [],
    attributes: ['url', 'target', 'rel', 'title'],
    specSection: '§9',
  },

  // ───────── Cards and groups ─────────
  {
    name: 'card',
    flavor: 'block',
    description: 'A bounded content group, typically with a border or shadow.',
    htmlMapping: '<div class="jeml-card">',
    variants: [
      { name: 'elevated', description: 'Raised with a shadow', emits: 'class="elevated"' },
      { name: 'bordered', description: 'Flat with a border', emits: 'class="bordered"' },
      { name: 'flat', description: 'No border or shadow', emits: 'class="flat"' },
    ],
    attributes: [],
  },
  {
    name: 'group',
    flavor: 'block',
    description:
      'A flexbox container. Use layout attributes (`layout`, `gap`, `align`, `justify`) to control arrangement.',
    htmlMapping: '<div class="jeml-group">',
    variants: [],
    attributes: ['layout', 'gap', 'align', 'justify', 'wrap'],
  },
  {
    name: 'stack',
    flavor: 'block',
    description: 'A vertical group. Shorthand for `group [layout=column]`.',
    htmlMapping: '<div class="jeml-stack">',
    variants: [],
    attributes: ['gap', 'align'],
  },
  {
    name: 'grid',
    flavor: 'block',
    description: 'A CSS Grid container. Use `cols`, `rows`, `gap` — and responsive overrides.',
    htmlMapping: '<div class="jeml-grid">',
    variants: [],
    attributes: ['cols', 'rows', 'gap', 'align', 'justify'],
    specSection: '§8.7',
  },

  // ───────── Tables ─────────
  {
    name: 'table',
    flavor: 'block',
    description: 'A data table. Contains `columns` and `row` blocks.',
    htmlMapping: '<table>',
    variants: [],
    attributes: [],
  },
  {
    name: 'columns',
    flavor: 'block',
    description: 'Column definitions for a table. Use `-` sibling markers with `[key=... label="..."]`.',
    htmlMapping: '<thead><tr>',
    variants: [],
    attributes: [],
  },
  {
    name: 'row',
    flavor: 'block',
    description: 'A data row in a table. Use `-` sibling markers for each cell.',
    htmlMapping: '<tr>',
    variants: [],
    attributes: [],
  },

  // ───────── Forms ─────────
  {
    name: 'form',
    flavor: 'block',
    description: 'A form container.',
    htmlMapping: '<form>',
    variants: [],
    attributes: ['method', 'action', 'on_submit'],
  },
  {
    name: 'field',
    flavor: 'void',
    description:
      'A labeled form field. The `type` attribute determines what input is generated (text, email, password, textarea, select, checkbox, radio, etc.).',
    htmlMapping: '<label><input> or <textarea> or <select></label>',
    variants: [],
    attributes: [
      'type',
      'name',
      'label',
      'placeholder',
      'value',
      'required',
      'disabled',
      'readonly',
      'rows',
      'cols',
      'min',
      'max',
      'step',
      'pattern',
      'autocomplete',
    ],
  },

  // ───────── Inline text ─────────
  {
    name: 'strong',
    flavor: 'inline',
    description: 'Strong emphasis (typically bold). Markdown shorthand: `**text**`.',
    htmlMapping: '<strong>',
    variants: [],
    attributes: [],
  },
  {
    name: 'em',
    flavor: 'inline',
    description: 'Emphasis (typically italic). Markdown shorthand: `_text_`.',
    htmlMapping: '<em>',
    variants: [],
    attributes: [],
  },
  {
    name: 'code',
    flavor: 'inline',
    description: 'Inline code. Markdown shorthand: `` `text` ``.',
    htmlMapping: '<code>',
    variants: [],
    attributes: [],
  },
  {
    name: 'span',
    flavor: 'inline',
    description: 'A generic inline container.',
    htmlMapping: '<span>',
    variants: [],
    attributes: [],
  },
  {
    name: 'badge',
    flavor: 'inline',
    description: 'A small inline badge or tag.',
    htmlMapping: '<span class="jeml-badge">',
    variants: [
      { name: 'info', description: 'Informational badge' },
      { name: 'success', description: 'Success state badge' },
      { name: 'warning', description: 'Warning state badge' },
      { name: 'danger', description: 'Danger/error state badge' },
    ],
    attributes: [],
  },
  {
    name: 'icon',
    flavor: 'any',
    description: 'An icon reference. The `name` attribute identifies the icon.',
    htmlMapping: '<i class="icon">',
    variants: [],
    attributes: ['name', 'size'],
  },

  // ───────── Void elements ─────────
  {
    name: 'image',
    flavor: 'void',
    description: 'An image.',
    htmlMapping: '<img>',
    variants: [],
    attributes: ['src', 'alt', 'width', 'height', 'loading'],
  },
  {
    name: 'break',
    flavor: 'void',
    description: 'A line break.',
    htmlMapping: '<br>',
    variants: [],
    attributes: [],
  },
  {
    name: 'divider',
    flavor: 'void',
    description: 'A horizontal rule.',
    htmlMapping: '<hr>',
    variants: [],
    attributes: [],
  },
  {
    name: 'spacer',
    flavor: 'void',
    description: 'An empty layout spacer.',
    htmlMapping: '<div class="jeml-spacer">',
    variants: [],
    attributes: ['size'],
  },
];

// ───────── Indexes ─────────

const TAG_INDEX = new Map<string, TagDefinition>(TAGS.map(t => [t.name, t]));

/**
 * Look up a tag by name. Returns null if not a registered tag.
 * Returning null from a completion context typically means "this is a user-defined
 * component" rather than "this is an error" — validation is a separate concern.
 */
export function lookupTag(name: string): TagDefinition | null {
  return TAG_INDEX.get(name) ?? null;
}

/**
 * Get all tags valid in a given flavor position.
 */
export function tagsForFlavor(flavor: Exclude<TagFlavor, 'any'>): TagDefinition[] {
  return TAGS.filter(t => t.flavor === flavor || t.flavor === 'any');
}

/**
 * All known tag names (for completion).
 */
export function allTagNames(): string[] {
  return TAGS.map(t => t.name);
}

/**
 * Get the global attributes that every tag accepts.
 */
export const GLOBAL_ATTRIBUTES = ['id', 'class', 'style', 'key', 'data-*', 'aria-*'];
