export type JEMLDocument = {
  directives: DirectiveNode[]
}

export type DirectiveNode =
  | MetaDirective
  | StyleDirective
  | ImportDirective
  | DocumentDirective
  | ScriptDirective

export type MetaDirective = {
  type: 'meta'
  attributes: Attribute[]
}

export type StyleDirective = {
  type: 'style'
  attributes: Attribute[]
  body?: string
}

export type ImportDirective = {
  type: 'import'
  from: string
  attributes: Attribute[]
  kind: 'default' | 'named' | 'namespace'
  /** Identifier for default/namespace forms, comma list for named */
  names: string[]
}

export type DocumentDirective = {
  type: 'document'
  children: Node[]
}

export type ScriptDirective = {
  type: 'script'
  attributes: Attribute[]
  body: string
}

export type Node =
  | BlockNode
  | VoidNode
  | SiblingItemNode
  | TextNode
  | FencedCodeNode
  | BlankNode
  | CommentNode
  | ControlIfNode
  | ControlForNode

export type BlockNode = {
  type: 'block'
  /** Base tag before any `.variant` segments */
  tag: string
  /** Dot segments after the base tag, e.g. `button.primary.lg` → `['primary','lg']` */
  variants: string[]
  attributes: Attribute[]
  children: Node[]
}

export type VoidNode = {
  type: 'void'
  tag: string
  variants: string[]
  attributes: Attribute[]
}

export type SiblingItemNode = {
  type: 'sibling-item'
  attributes: Attribute[]
  children: Node[]
}

export type TextNode = {
  type: 'text'
  value: string
}

export type FencedCodeNode = {
  type: 'fenced-code'
  language: string
  code: string
}

export type BlankNode = {
  type: 'blank'
}

export type CommentNode = {
  type: 'comment'
}

export type ControlIfBranch = {
  /** Raw condition expression between `(` and `)`; empty for the final `else` */
  condition: string
  children: Node[]
}

export type ControlIfNode = {
  type: 'control-if'
  branches: ControlIfBranch[]
}

export type ControlForNode = {
  type: 'control-for'
  /** Raw iterable expression, e.g. `&items` */
  iterable: string
  /** Iterator binding without `$`, e.g. `item` */
  item: string
  /** Optional index binding without `$` */
  index?: string
  children: Node[]
}

export type Attribute = {
  key: string
  value?: string
  boolean: boolean
  /** §8.6 responsive overrides for this attribute */
  overrides?: Array<{ breakpoint: string; value: string }>
}
