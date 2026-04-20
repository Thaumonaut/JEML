/**
 * Attribute metadata — for each known attribute, what kind of value it accepts
 * and whether responsive overrides are meaningful.
 *
 * This enables:
 * - Completions for enum attribute values (e.g. `type=email` suggestions)
 * - Warnings when responsive overrides are used on style attributes
 * - Hover documentation
 */

export type AttributeValueKind =
  | 'string'      // any quoted string
  | 'identifier'  // unquoted bare identifier
  | 'number'      // unquoted number
  | 'length'      // CSS length (px, rem, em, %, vh, vw)
  | 'boolean'     // true/false or bare flag
  | 'enum'        // one of a fixed set of values
  | 'url'         // quoted URL
  | 'reference';  // &variable or @handler

export type AttributeClass = 'layout' | 'style' | 'behavior' | 'metadata';

export interface AttributeDefinition {
  /** The attribute name */
  name: string;
  /** What category — determines whether responsive overrides are allowed */
  class: AttributeClass;
  /** Kinds of values accepted (some attributes accept multiple) */
  accepts: AttributeValueKind[];
  /** For enum attributes, the list of valid values */
  enumValues?: string[];
  /** Short description for hover */
  description: string;
  /** Whether this attribute meaningfully accepts responsive overrides */
  responsive: boolean;
  /** Spec section */
  specSection?: string;
}

export const ATTRIBUTES: AttributeDefinition[] = [
  // ───────── Layout attributes (responsive-capable) ─────────
  {
    name: 'cols',
    class: 'layout',
    accepts: ['number'],
    description: 'Number of columns in a grid layout.',
    responsive: true,
    specSection: '§8.7',
  },
  {
    name: 'rows',
    class: 'layout',
    accepts: ['number'],
    description: 'Number of rows in a grid layout.',
    responsive: true,
    specSection: '§8.7',
  },
  {
    name: 'gap',
    class: 'layout',
    accepts: ['enum', 'length'],
    enumValues: ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'],
    description: 'Spacing between layout children.',
    responsive: true,
    specSection: '§8.7',
  },
  {
    name: 'layout',
    class: 'layout',
    accepts: ['enum'],
    enumValues: ['row', 'column', 'row-reverse', 'column-reverse'],
    description: 'Flex direction for a `group`.',
    responsive: true,
    specSection: '§8.7',
  },
  {
    name: 'align',
    class: 'layout',
    accepts: ['enum'],
    enumValues: ['start', 'center', 'end', 'stretch', 'baseline'],
    description: 'Cross-axis alignment (align-items).',
    responsive: true,
  },
  {
    name: 'justify',
    class: 'layout',
    accepts: ['enum'],
    enumValues: ['start', 'center', 'end', 'between', 'around', 'evenly'],
    description: 'Main-axis alignment (justify-content).',
    responsive: true,
  },
  {
    name: 'wrap',
    class: 'layout',
    accepts: ['boolean', 'enum'],
    enumValues: ['true', 'false', 'reverse'],
    description: 'Whether flex children should wrap.',
    responsive: true,
  },
  {
    name: 'size',
    class: 'layout',
    accepts: ['enum', 'length'],
    enumValues: ['xs', 'sm', 'md', 'lg', 'xl'],
    description: 'Element size — typography scale or explicit CSS length.',
    responsive: true,
  },
  {
    name: 'pad',
    class: 'layout',
    accepts: ['enum', 'length'],
    enumValues: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
    description: 'Internal padding.',
    responsive: true,
  },
  {
    name: 'margin',
    class: 'layout',
    accepts: ['enum', 'length'],
    enumValues: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
    description: 'External margin.',
    responsive: true,
  },
  {
    name: 'visible',
    class: 'layout',
    accepts: ['boolean'],
    description: 'Whether the element is rendered. Useful with responsive overrides.',
    responsive: true,
  },

  // ───────── Style attributes (not responsive-capable) ─────────
  {
    name: 'color',
    class: 'style',
    accepts: ['identifier', 'string'],
    description: 'Text color. Use a design token or CSS color. Not responsive — use themes.',
    responsive: false,
  },
  {
    name: 'background',
    class: 'style',
    accepts: ['identifier', 'string'],
    description: 'Background color. Not responsive — use themes.',
    responsive: false,
  },
  {
    name: 'radius',
    class: 'style',
    accepts: ['enum', 'length'],
    enumValues: ['none', 'sm', 'md', 'lg', 'full'],
    description: 'Border radius.',
    responsive: false,
  },
  {
    name: 'shadow',
    class: 'style',
    accepts: ['enum'],
    enumValues: ['none', 'sm', 'md', 'lg', 'xl'],
    description: 'Drop shadow depth.',
    responsive: false,
  },
  {
    name: 'font',
    class: 'style',
    accepts: ['identifier', 'string'],
    description: 'Font family reference.',
    responsive: false,
  },
  {
    name: 'weight',
    class: 'style',
    accepts: ['enum'],
    enumValues: ['thin', 'light', 'normal', 'medium', 'semibold', 'bold', 'black'],
    description: 'Font weight.',
    responsive: false,
  },

  // ───────── Form fields ─────────
  {
    name: 'type',
    class: 'behavior',
    accepts: ['enum'],
    enumValues: [
      'text',
      'email',
      'password',
      'url',
      'tel',
      'number',
      'search',
      'date',
      'time',
      'datetime',
      'textarea',
      'select',
      'checkbox',
      'radio',
      'file',
      'hidden',
      'submit',
    ],
    description: 'Form field or button type.',
    responsive: false,
  },
  {
    name: 'name',
    class: 'metadata',
    accepts: ['identifier', 'string'],
    description: 'Field name (used as the form data key).',
    responsive: false,
  },
  {
    name: 'label',
    class: 'metadata',
    accepts: ['string'],
    description: 'Visible label text for a form field.',
    responsive: false,
  },
  {
    name: 'placeholder',
    class: 'metadata',
    accepts: ['string'],
    description: 'Placeholder text shown when field is empty.',
    responsive: false,
  },
  {
    name: 'value',
    class: 'behavior',
    accepts: ['string', 'reference'],
    description: 'Initial or bound value of the field.',
    responsive: false,
  },
  {
    name: 'required',
    class: 'behavior',
    accepts: ['boolean'],
    description: 'Whether the field must be filled.',
    responsive: false,
  },
  {
    name: 'disabled',
    class: 'behavior',
    accepts: ['boolean', 'reference'],
    description: 'Whether the field is disabled.',
    responsive: false,
  },
  {
    name: 'readonly',
    class: 'behavior',
    accepts: ['boolean'],
    description: 'Whether the field is read-only.',
    responsive: false,
  },

  // ───────── Links ─────────
  {
    name: 'url',
    class: 'metadata',
    accepts: ['url', 'string'],
    description: 'The link destination.',
    responsive: false,
  },
  {
    name: 'target',
    class: 'behavior',
    accepts: ['enum'],
    enumValues: ['_self', '_blank', '_parent', '_top'],
    description: 'Link target window.',
    responsive: false,
  },
  {
    name: 'rel',
    class: 'metadata',
    accepts: ['string'],
    description: 'Link relationship (e.g., `noopener`, `nofollow`).',
    responsive: false,
  },

  // ───────── Media ─────────
  {
    name: 'src',
    class: 'metadata',
    accepts: ['url', 'string'],
    description: 'Media source URL.',
    responsive: false,
  },
  {
    name: 'alt',
    class: 'metadata',
    accepts: ['string'],
    description: 'Alternative text for accessibility.',
    responsive: false,
  },
  {
    name: 'width',
    class: 'layout',
    accepts: ['number', 'length'],
    description: 'Explicit width.',
    responsive: true,
  },
  {
    name: 'height',
    class: 'layout',
    accepts: ['number', 'length'],
    description: 'Explicit height.',
    responsive: true,
  },

  // ───────── Handlers ─────────
  {
    name: 'on_press',
    class: 'behavior',
    accepts: ['reference'],
    description: 'Handler invoked when the element is clicked.',
    responsive: false,
  },
  {
    name: 'on_change',
    class: 'behavior',
    accepts: ['reference'],
    description: 'Handler invoked when the value changes.',
    responsive: false,
  },
  {
    name: 'on_submit',
    class: 'behavior',
    accepts: ['reference'],
    description: 'Handler invoked when a form is submitted.',
    responsive: false,
  },
  {
    name: 'on_input',
    class: 'behavior',
    accepts: ['reference'],
    description:
      'Handler invoked on every keystroke / value change of an input. In solid-jotlang, receives the native InputEvent.',
    responsive: false,
  },
  {
    name: 'on_blur',
    class: 'behavior',
    accepts: ['reference'],
    description: 'Handler invoked when the element loses focus.',
    responsive: false,
  },
  {
    name: 'on_focus',
    class: 'behavior',
    accepts: ['reference'],
    description: 'Handler invoked when the element gains focus.',
    responsive: false,
  },
  {
    name: 'on_keydown',
    class: 'behavior',
    accepts: ['reference'],
    description: 'Handler invoked on keydown. Receives the native KeyboardEvent.',
    responsive: false,
  },
  {
    name: 'on_keyup',
    class: 'behavior',
    accepts: ['reference'],
    description: 'Handler invoked on keyup. Receives the native KeyboardEvent.',
    responsive: false,
  },
  {
    name: 'on_mount',
    class: 'behavior',
    accepts: ['reference'],
    description:
      'solid-jotlang: handler invoked once after the element mounts (Solid `onMount` lifecycle).',
    responsive: false,
  },
  {
    name: 'on_cleanup',
    class: 'behavior',
    accepts: ['reference'],
    description:
      'solid-jotlang: handler invoked when the element unmounts (Solid `onCleanup` lifecycle).',
    responsive: false,
  },

  // ───────── Directive-specific ─────────
  {
    name: 'title',
    class: 'metadata',
    accepts: ['string'],
    description: 'Page title (in `>> meta`) or element title attribute.',
    responsive: false,
  },
  {
    name: 'description',
    class: 'metadata',
    accepts: ['string'],
    description: 'Page description for `>> meta`.',
    responsive: false,
  },
  {
    name: 'icon',
    class: 'metadata',
    accepts: ['url', 'string'],
    description: 'Favicon path for `>> meta`, or icon name for inline elements.',
    responsive: false,
  },
  {
    name: 'from',
    class: 'metadata',
    accepts: ['string'],
    description: 'Source module for `>> import`.',
    responsive: false,
  },
  {
    name: 'ref',
    class: 'metadata',
    accepts: ['url', 'string'],
    description: 'External reference (e.g., stylesheet path).',
    responsive: false,
  },

  // ───────── Global-like ─────────
  {
    name: 'id',
    class: 'metadata',
    accepts: ['identifier', 'string'],
    description: 'Unique element ID.',
    responsive: false,
  },
  {
    name: 'key',
    class: 'metadata',
    accepts: ['identifier', 'string', 'reference'],
    description: 'Stable key for list/loop items.',
    responsive: false,
  },
];

// ───────── Indexes ─────────

const ATTR_INDEX = new Map<string, AttributeDefinition>(ATTRIBUTES.map(a => [a.name, a]));

export function lookupAttribute(name: string): AttributeDefinition | null {
  return ATTR_INDEX.get(name) ?? null;
}

export function layoutAttributes(): string[] {
  return ATTRIBUTES.filter(a => a.class === 'layout').map(a => a.name);
}

export function styleAttributes(): string[] {
  return ATTRIBUTES.filter(a => a.class === 'style').map(a => a.name);
}

/**
 * Is an attribute allowed to receive responsive overrides without a warning?
 */
export function supportsResponsive(attrName: string): boolean {
  const def = lookupAttribute(attrName);
  return def?.responsive ?? false;
}
