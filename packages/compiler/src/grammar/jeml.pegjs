{
  // Grammar intentionally keeps v1 static subset shape.
  // Runtime parser in src/parser/parser.ts performs the full fixture-oriented parse.
  // Block headings use dot notation: heading.N (N=1–6), not [level="N"].
}

Start
  = _ directives:Directive* _ { return directives; }

Directive
  = MetaDirective
  / StyleDirective
  / DocumentDirective

MetaDirective
  = "!>" __ "meta" AttrList? LineEnd

StyleDirective
  = "!>" __ "style" AttrList? (":" [^\n]* LineEnd / LineEnd)

DocumentDirective
  = "!>" __ "document" ":" LineEnd

AttrList
  = _ "[" (!"]" .)* "]"

LineEnd
  = _ ("\r\n" / "\n" / "\r")

_ = [ \t]*
__ = [ \t]+
