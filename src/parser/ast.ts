export type JEMLDocument = {
  directives: DirectiveNode[]
}

export type DirectiveNode = MetaDirective | StyleDirective | DocumentDirective

export type MetaDirective = {
  type: 'meta'
  attributes: Attribute[]
}

export type StyleDirective = {
  type: 'style'
  attributes: Attribute[]
  content?: string
}

export type DocumentDirective = {
  type: 'document'
  children: Node[]
}

export type Node =
  | BlockNode
  | VoidNode
  | SiblingItemNode
  | TextNode
  | FencedCodeNode
  | BlankNode
  | CommentNode

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

export type Attribute = {
  key: string
  value?: string
  boolean: boolean
  /** §8.6 responsive overrides for this attribute */
  overrides?: Array<{ breakpoint: string; value: string }>
}
