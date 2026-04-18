# JEML v0.4 Rule Book

**Jacob's Easy Markup Language — Draft Specification**

This document is the working specification for JEML v0.4. It captures every design decision made so far and flags the open questions that still need resolution. Rules are numbered so they can be referenced and amended individually.

*Revision history:*
- *v0.4 — directives moved to `>>`/`<<`; inline moved to `/>`/`</`; `!>` repurposed for void elements (no body, no closer); `/` and `|` self-close forms removed; `|>`/`<|` reserved for future structural additions; `.variant` syntax added for enumerated variants; component/inline unification; unquoted numeric/boolean/identifier attribute values; responsive overrides via `^(breakpoint)=value`; layout/style attribute distinction.*
- *v0.3 — mandatory `:` content delimiter added to block and inline elements.*
- *v0.2 — sigil system consolidated to `&`/`@`/`$`; `/italic/` replaced with `_italic_`; `{...}` added as optional expression wrapper.*

---

## 1. Design Principles

1.1. **As simple as Markdown, as powerful as XML.** Content-shaped things use lightweight sigils; structure-shaped things use a consistent bracket grammar.

1.2. **Readable by humans and AI.** Syntax should be scannable without syntax highlighting and use fewer tokens than equivalent HTML.

1.3. **One sigil, one job.** Each symbol does exactly one thing, and the symbol's shape should suggest its meaning where possible.

1.4. **Reduce nesting.** Structural nesting should reflect semantic nesting, not styling or layout wrappers.

1.5. **Visual grammar for entry and exit.** A reader should be able to identify where any block starts and ends without matching tag names.

1.6. **Single-file components with separated concerns.** Markup, style, and script live in one file but in clearly distinct directive sections.

1.7. **Ergonomic to type.** Sigil choices account for keyboard layout and typing frequency.

1.8. **No premature cross-target abstraction.** v1 targets HTML.

---

## 2. File Structure

2.1. A JEML file is a **single-file component**. Each file defines exactly one component by default, exported as the default.

2.2. A JEML file consists of one or more **directives**, each opened with `>>` and closed with `<<`.

2.3. Standard directives:
- `>> meta` — document metadata
- `>> style` — styles (inline or via `ref`)
- `>> import` — import components or libraries
- `>> export` — named sub-component exports
- `>> document` — the markup tree
- `>> script` — reactive state and handler logic

2.4. Conventional order: `meta`, `import`, `style`, `document`, `script`.

2.5. Directives follow the same `:` rule as block elements (§4.2). Directives with body content use `:`; directives with only attributes terminate at end-of-line without a closer:

```
>> meta [title="Page"]                          % attrs only, no body, no closer
>> style [type="css" ref="main.css"]            % attrs only, no body, no closer
>> import [from="./button.jeml"]: Button        % content after attrs
>> style [type="css"]: { .foo {} } <<           % inline CSS body
>> document:                                    % multi-line markup body
  ...
<< document
```

2.6. Only one `>> document` directive per file.

---

## 3. Sigil Reference

| Sigil | Meaning | Context |
|-------|---------|---------|
| `>>` ... `<<` | Directive open/close | Top level only |
| `>` ... `<` | Block element open/close | Inside `>> document` |
| `/>` ... `</` | Inline element open/close | Inside block content |
| `!>` | Void element (no body, no closer) | Block context only |
| `:` | Content delimiter | After tag declaration |
| `[` ... `]` | Attribute list | Following tag name |
| `{` ... `}` | Expression wrapper / script code block | Content positions; inside `>> script` |
| `"..."` `'...'` | String literals | Attribute values, script strings |
| `&name` | Variable reference | Content and attribute values |
| `@name` | Handler / function reference | Attribute values, expressions |
| `$name` | Iterator reference | Inside `~ for` loop bodies |
| `~` | Control flow prefix | Start of line in markup |
| `~<` | Control flow close | End of `~ for` or `~ if` block |
| `-` | Sibling item marker | Inside container blocks |
| `#'text'[...]` | Link shorthand | Inline content |
| `**text**` | Bold | Inline content |
| `_text_` | Italic | Inline content |
| `` `text` `` | Inline code | Inline content |
| ` ``` ` ... ` ``` ` | Fenced code block | Block content |
| `.variant` | Tag variant selector | After tag name |
| `^(breakpoint)=value` | Responsive attribute override | Inside attribute lists |
| `? :` | Inline ternary | Content and attribute values |
| `%` | Line comment | Anywhere except inside strings |
| `%{` ... `%}` | Block comment | Anywhere except inside strings |
| `\` | Escape character | Before any sigil |

**Reserved for future use:** `|>` ... `<|` — protected from casual reuse, likely for tables or other 2D structural layouts.

### 3.1. The Three Reference Sigils

- **`&name`** — variable from `>> script`. Holds a value. Reactive.
- **`@name`** — handler (function) from `>> script`. Passed by reference or invoked with args.
- **`$name`** — iterator from a `~ for` loop. Scoped to the loop body.

Sigils are not interchangeable. Using the wrong one is a compile error.

### 3.2. The Structural Sigils

- `>>` `<<` — directives (document-scope, rare)
- `>` `<` — block elements (multi-line, common)
- `/>` `</` — inline elements (single-line, common)
- `!>` — void elements (no body, no closer, block context)

---

## 4. Block Elements

4.1. A block element: `> tagname [attrs]: content` or `> tagname [attrs]:` with content on following lines.

4.2. **The `:` delimiter is mandatory when content follows.** Empty blocks still use `:` and close with `<` on the next line.

4.3. Closer is `<`, optionally with the tag name: `< tagname`. Named closers are recommended for blocks longer than ~10 lines.

4.4. Block elements contain block elements, inline elements, void elements, text content, or any combination.

4.5. **Empty blocks** use the two-line form:

```
> empty_placeholder:
<
```

There is no single-line self-closing form for blocks. For truly bodyless elements (images, fields), use void elements (§6).

4.6. An opening `>` without `:` is a parse error.

4.7. Standard block vocabulary:
- Structural: `section`, `nav`, `header`, `footer`, `aside`, `main`, `article`
- Content: `heading`, `text`, `list`, `table`, `form`, `button`, `link`, `code`
- Layout: `stack`, `row`, `grid`, `group`, `card`, `block`
- Dynamic: `row` (in tables), `columns`

4.8. Unknown tag names compile to web components (`<jeml-tagname>`) unless imported.

4.9. **Examples:**

```
> heading.1: Hello, world <                    % single-line content

> section [id="hero"]:                         % multi-line content
  > heading.1: Welcome <
<

> empty_placeholder:                           % empty block
<
```

---

## 5. Inline Elements

5.1. Inline element: `/> tagname [attrs]: content </`.

5.2. **The `:` delimiter is mandatory when content follows.** Empty inline elements still use the form `/> tag [attrs]: </`.

5.3. Inline content does not require quotes but may use them to preserve whitespace and disable sigil parsing.

5.4. Inline elements cannot span line breaks.

5.5. Inline elements may be nested.

5.6. **Empty inline elements** are the canonical form for inline icons, avatars, etc.:

```
/> icon [name="star"]: </
/> avatar [user=&user]: </
```

5.7. **Examples:**

```
/> span [class="highlight"]: emphasize this </
/> badge.warning: New </
/> icon [name="star"]: </
/> link [url="/a"]: nested /> em: text </ content </
```

---

## 6. Void Elements

6.1. A void element: `!> tagname [attrs]`. No body, no closer.

6.2. **Void elements are block-context only.** For inline "void-like" elements in prose, use the empty-content inline form (§5.6).

6.3. Use void form for elements that are semantically bodyless — they carry all information through attributes.

6.4. **Standard void vocabulary:**

| Void tag | HTML equivalent | Notes |
|----------|-----------------|-------|
| `!> image` | `<img>` | `url` or `src` required |
| `!> field` | `<label>` wrapping `<input>`/`<textarea>`/`<select>` | `type` attribute determines kind |
| `!> break` | `<br>` | No attributes |
| `!> spacer` | `<div class="jeml-spacer">` | `size` attribute |
| `!> divider` | `<hr>` | |
| `!> icon` | `<i class="icon">` | Block-level; for inline use `/> icon: </` |

6.5. **User components may be used as void elements** if they have no content slots:

```
!> Avatar [user=&user size="lg"]
!> SearchBox [placeholder="Search..."]
```

6.6. **Examples:**

```
!> image [src="/logo.svg" alt="Logo"]
!> break
!> field [type="email" name="email" label="Email" required]
!> divider
```

---

## 7. Tag Variants

7.1. Tag names may include variants introduced by `.`: `heading.1`, `button.primary`, `card.elevated`.

7.2. Variants are restricted to the enumerated list defined per tag. Unknown variants produce a warning or error.

7.3. Multiple variants can be stacked: `button.primary.lg`.

7.4. Variants represent sub-types (the element's identity); attributes represent properties.

7.5. **Standard variants:**

| Tag | Variants |
|-----|----------|
| `heading` | `.1` through `.6` (default: `.1`) |
| `button` | `.primary`, `.secondary`, `.ghost`, `.danger`, `.sm`, `.md`, `.lg` |
| `card` | `.elevated`, `.bordered`, `.flat` |
| `list` | `.bullet` (default), `.number`, `.none` |
| `text` | `.lead`, `.body` (default), `.muted`, `.caption` |

7.6. **Examples:**

```
> heading.1: Page title <
> heading.2: Section heading <
> button.primary.lg: Sign up <
> list.number:
  - First
  - Second
<
```

---

## 8. Attributes

8.1. Attributes appear in `[...]` after tag name and variants: `> tag.variant [key="value"]`.

8.2. Attributes are whitespace-separated. Newlines permitted for readability.

8.3. Attribute values are one of:
- **Quoted string:** `key="value"` or `key='value'`
- **Unquoted number:** `key=4`, `key=1.5`, `key=-3`
- **Unquoted boolean:** `key=true`, `key=false`
- **Unquoted identifier:** `key=primary`, `key=lg`, `key=hero-gradient` — treated as a string literal
- **Unquoted CSS length (in responsive breakpoints):** `500px`, `4rem`, `30em`
- **Variable reference:** `key=&variable` or `key=&obj.path.to.value`
- **Handler reference:** `key=@handler_name`
- **Handler invocation:** `key=@handler(&arg1, &arg2)`
- **Iterator reference (inside loops):** `key=$item.name`
- **Bare boolean flag:** `required` (equivalent to `required=true`)
- **Ternary:** `key=&cond ? "a" : "b"` or `key=&cond ? a : b`
- **Expression:** `key={&count + 1}` or `key={&user.name.toUpperCase()}`

Unquoted identifiers must match the pattern `[a-zA-Z_][a-zA-Z0-9_-]*`. Values containing spaces, quotes, or other special characters require quotes. Bare identifiers are string literals, never variable references — references always use `&`, `@`, or `$`.

8.4. Attribute keys are lowercase with underscores or hyphens. Compiler maps to target conventions (e.g., `on_press` → `onClick` in HTML output).

8.5. **Multi-line form** is standard for non-trivial attribute lists:

```
> button.primary [
    type=submit
    on_press=@submit_form
    disabled=&submitting
  ]: Sign up <
```

### 8.6. Responsive Overrides

8.6.1. Layout attributes (§8.7) may specify responsive override values using the `^(breakpoint)=value` syntax. The breakpoint is a CSS length (pixels, rem, em) specifying the **minimum viewport width** at which the override applies. The base value applies below the breakpoint; overrides apply at and above (mobile-first).

8.6.2. **Two binding forms** are available:
- **Explicit:** `attr^(breakpoint)=value` — the override states which base attribute it modifies.
- **Implicit:** `^(breakpoint)=value` — the override binds to the most recently declared base attribute in the same attribute list.

The explicit form is unambiguous; the implicit form is shorthand for cases where the binding is obvious from proximity.

8.6.3. **Multiple overrides** are permitted per attribute. The compiler sorts them by ascending breakpoint value and emits mobile-first media queries:

```
> grid [cols=1 ^(768px)=2 ^(1024px)=3 gap=sm ^(768px)=md]
```

This compiles to:
```css
.jeml-grid { --cols: 1; --gap: sm; }
@media (min-width: 768px) {
  .jeml-grid { --cols: 2; --gap: md; }
}
@media (min-width: 1024px) {
  .jeml-grid { --cols: 3; }
}
```

8.6.4. An implicit override with no preceding base attribute in the same list is a parse error.

8.6.5. Explicit overrides do not update the "most recent base attribute" tracker. The tracker only advances when a new base attribute is declared. This means:

```
[cols=1 cols^(768px)=2 ^(1024px)=3]
```

The implicit `^(1024px)=3` still binds to `cols` because the explicit override in the middle didn't introduce a new base.

8.6.6. Overrides on **style attributes** (§8.7) compile with a warning. Overrides are semantically meaningful only on layout attributes. See §8.7 for the classification.

### 8.7. Layout vs Style Attributes

JEML distinguishes two categories of attributes with different semantics:

**Layout attributes** describe *where* things are placed and how they behave at different viewport sizes. Responsive overrides are permitted on these.

| Attribute | Meaning |
|-----------|---------|
| `cols` | Number of columns (grids) |
| `rows` | Number of rows (grids) |
| `gap` | Spacing between children |
| `layout` | Container direction (row, column, flow) |
| `align` | Cross-axis alignment |
| `justify` | Main-axis alignment |
| `size` | Element dimensions |
| `order` | Position within parent |
| `visible` | Whether element renders |
| `wrap` | Whether items wrap |
| `grow` | Flex-grow behavior |
| `shrink` | Flex-shrink behavior |
| `pad` | Internal padding |
| `margin` | External margin |

**Style attributes** describe *what things look like* and do not depend on viewport. Responsive overrides on style attributes are allowed syntactically but compile with a warning.

| Attribute | Meaning |
|-----------|---------|
| `color` | Text or accent color |
| `background` | Background color or image |
| `radius` | Corner roundness |
| `shadow` | Drop shadow |
| `font` | Font family |
| `weight` | Font weight |
| `opacity` | Transparency |
| `texture` | Surface texture |
| `border` | Border specification |
| `variant` | Semantic sub-type |

**Universal attributes** apply to both categories and are not classified: `id`, `key`, `name`, `type`, `style`, `class`, and all event handlers (`on_press`, `on_submit`, etc.).

The `style` attribute is special: it invokes a named design-system pattern (a CSS class in HTML output). Responsive overrides on `style` are permitted but are treated as theme-scoped rather than viewport-scoped.

---

## 9. Variables and Interpolation

9.1. `&name` references a variable from `>> script`.

9.2. In content position, `&name` renders the value. In attribute position, it passes the value.

9.3. Property access: `&user.profile.name`. Array indexing only inside expressions: `&items[0]`.

9.4. Literal `&`: escape with `\&`.

9.5. **Expression wrapper `{...}`** for computed values:

```
> text:
  Hello, &user.name. You have &task_count tasks.
  {&task_count == 0 ? "Get started!" : "Keep going!"}
  Total: {@format_currency(&cart.total)}
<
```

9.6. Expressions use JS/TS syntax with `&`, `@`, `$` as reference prefixes.

9.7. `let` declarations are reactive; `const` declarations are not.

---

## 10. Handlers and Events

10.1. `@name` references a handler from `>> script`.

10.2. Event attributes use `on_event` naming: `on_press`, `on_submit`, `on_change`, etc.

10.3. By reference: `on_press=@handle_click`.

10.4. With pre-bound args: `on_press=@delete_item(&item.id)`.

10.5. Handler definition:

```
handle_click (event) { /* ... */ }
handle_delete (id, event) { /* ... */ }
```

10.6. Inside script, references use no sigil. Sigils are for the markup-to-script boundary only.

---

## 11. Control Flow

11.1. Control flow prefixed with `~`. Forms: `~ for`, `~ if`, `~ else`, `~ else if`.

11.2. **Loop:**

```
~ for (&items as $item)
  > row [key=$item.id]:
    - $item.name
  <
~<
```

11.3. Loop closes with `~<`.

11.4. Iterator bindings use `$`. Declared in `as $name`. Scoped to loop body.

11.5. Index bind: `~ for (&items as $item, $index)`.

11.6. **Conditional:**

```
~ if (&user.is_admin)
  > section: Admin <
~ else if (&user.is_member)
  > section: Member <
~ else
  > section: Public <
~<
```

11.7. **Inline ternary:** `&cond ? a : b` for single-value conditionals.

---

## 12. The `-` Sibling Marker

12.1. `-` prefixes a sibling item in a container block. Rendering depends on container.

12.2. `-` must be followed by a space before content.

12.3. Items may contain any content.

12.4. Using `-` in a container that doesn't support it is a parse error.

---

## 13. Strings and Escaping

13.1. Strings use `"..."` or `'...'`. Either may contain the other without escaping.

13.2. Escape sequences: `\n`, `\t`, `\r`, `\\`, `\"`, `\'`, `\&`, `\@`, `\$`, `\uXXXX`.

13.3. Multi-line strings: backticks `` `...` `` in attributes or script.

13.4. `\` before any sigil treats it as literal.

---

## 14. Comments

14.1. Line comments: `%` to end-of-line.

14.2. Block comments: `%{ ... %}`, no nesting.

14.3. Allowed anywhere whitespace is allowed.

14.4. Stripped at compile time.

---

## 15. Markdown-Style Inline Sigils

15.1. `**text**` → `/> strong: text </`

15.2. `_text_` → `/> em: text </`. Literal underscore: `\_`.

15.3. `` `text` `` → `/> code: text </`

15.4. Triple backticks open/close fenced code blocks with optional language: ` ```typescript `.

15.5. Markdown sigils do not nest. `**bold _italic_ more**` treats `_italic_` as literal.

15.6. Markdown sigils parse only in content positions, not in attributes or strings.

15.7. Interpolation (`&name`, `{...}`) is permitted inside Markdown sigils but mixed-heavy usage is a style smell.

---

## 16. Links

16.1. Link shorthand: `#'text'[url="..."]`.

16.2. Either `'...'` or `"..."` bounds the text.

16.3. Whitespace between closing quote and `[` is optional, must not span line break.

16.4. Link attributes: `url` (required), `title`, `target`, `rel`.

16.5. Icon-only links: use the inline form `/> link [url="..."]: /> icon [name="home"]: </ </`.

16.6. Link text may contain references and expressions:

```
#'Welcome back, &user.first_name'[url="/profile"]
#'{&unread_count} unread messages'[url="/inbox"]
```

---

## 17. Imports and Exports

17.1. Imports use `>> import`:

```
>> import [from="./components/button.jeml"]: Button
>> import [from="./lib/utils"]: { format_date }
>> import [from="@std/format"]: * as fmt
```

17.2. Three forms: default, named (in braces), namespace (star-as).

17.3. Paths: `./` relative, `@std/` standard library, `@package/` registry (TBD).

17.4. Default export is the component defined by `>> document`. Named from filename (PascalCased).

17.5. Additional exports:

```
>> export: { SmallButton, IconButton }
```

17.6. **Imported components can be used in any position:**

```
> Card [style="profile"]:              % block position
  /> Avatar [user=&user]: </            % inline position
  !> SearchBox [placeholder="..."]     % void position
< Card
```

---

## 18. The Script Section

18.1. `>> script` contains state and handlers. `type` attribute specifies language (default `typescript`).

18.2. Script has access to: same-section declarations, imports, props (TBD).

18.3. `let` is reactive; `const` is not.

18.4. Top-level functions are handlers (referenced via `@name` in markup).

18.5. **Inside script, no sigils:**

```
>> script [type="typescript"]: {
  let count = 0
  
  increment () {
    count = count + 1    % plain reference, no sigil
  }
}
<<

>> document:
  > text: Current: &count <
  > button.primary [on_press=@increment]: Add one <
<<
```

18.6. Lifecycle hooks (`on_mount`, `on_destroy`) TBD.

---

## 19. Anti-Patterns

19.1. Deep structural nesting for styling. Use attributes and variants instead.

19.2. Tag-heavy inline content. Prefer Markdown sigils or link shorthand.

19.3. Logic in markup. Complex expressions belong in script.

19.4. Redundant closers. `< section` is useful; `< section [id="hero"]` is noise.

19.5. Mixed-heavy Markdown sigils. Prefer explicit `/> strong ... </` when references dominate.

19.6. Sigil confusion. `&`, `@`, `$` are not interchangeable.

19.7. Void elements with content. If a tag needs content, use block or inline.

19.8. Variants on unknown tags. Variants must be declared per tag.

19.9. Responsive overrides on style attributes. Responsive design is about *layout*, not appearance. If you're reaching for `color^(768px)=blue`, you probably want a different theme, not a responsive override.

19.10. Ambiguous implicit overrides. If an attribute list has multiple overrides interleaved with multiple base attributes, use the explicit form (`attr^(breakpoint)=value`) to remove ambiguity.

---

## 20. Versioning

20.1. This is JEML v0.4 draft. Breaking changes permitted before v1.0.

20.2. Post-1.0 breaking changes require v2.0 and a migration tool.

20.3. New sigils require RFC with justification and collision analysis.

20.4. `|>` / `<|` reserved; protect from casual reuse.

---

## 21. Open Design Questions

21.1. Component props syntax.
21.2. Slots and children.
21.3. Lifecycle hooks API.
21.4. Two-way binding (`bind=&variable`).
21.5. Capability declarations for imports.
21.6. Standard library scope.
21.7. Style scoping (component-local vs global).
21.8. Error handling for missing references.
21.9. Non-HTML targets (v2+).
21.10. Reactivity edge cases (destructuring, async mutations).
21.11. Tables as first-class (potential use of reserved `|>` `<|`).

---

## Appendix A: Syntax Highlighter Token Classes

| Token class | Matches | Color family |
|-------------|---------|--------------|
| `directive` | `>>`, `<<` | Pink / magenta |
| `block` | `>`, `<` | Blue |
| `inline` | `/>`, `</` | Teal |
| `void` | `!>` | Orange / amber |
| `tag` | Tag names | Blue (lighter) |
| `variant` | `.variant` | Blue (distinct shade) |
| `attr-key` | Attribute keys | Amber |
| `string` | Quoted strings | Green |
| `number` | Unquoted numbers and CSS lengths | Light green |
| `boolean` | `true`, `false` | Light blue |
| `identifier` | Unquoted identifier values | Green (same as string) |
| `responsive` | `^(breakpoint)=` | Coral (bright) |
| `var` | `&name` | Purple |
| `handler` | `@name` | Purple (lighter) |
| `iterator` | `$name` | Orange |
| `control` | `~` flow | Coral |
| `list` | `-` markers | Coral (muted) |
| `link` | Link shorthand | Red |
| `md-bold` | `**...**` | Bold |
| `md-italic` | `_..._` | Italic, muted |
| `md-code` | `` `...` `` | Mono with bg |
| `comment` | `%` / `%{...%}` | Gray, italic |
| `content-delim` | `:` | Muted neutral |

---

## Appendix B: Worked Example

```
>> meta [
  title="User Profile"
  description="Displays a user's profile with edit controls"
]

>> import [from="./components/avatar.jeml"]: Avatar
>> import [from="@std/format"]: { format_date }

>> style [type=css]: {
  .profile-card {
    padding: 1.5rem;
    border-radius: 0.5rem;
    background: var(--surface);
  }
}
<<

>> document:
  > section [style=profile-card]:
    > group [
        layout=column ^(768px)=row
        gap=md
        align=center
      ]:
      !> Avatar [user=&user size=lg]
      > stack:
        > heading.2: &user.display_name <
        > text.muted:
          Member since #'{@format_date(&user.joined_at)}'[url="/about/membership"]
        <
      <
    <

    ~ if (&user.bio)
      > text [style=body]:
        &user.bio
      <
    ~<

    > heading.3: Recent projects <
    > grid [cols=1 ^(500px)=2 ^(1024px)=3 gap=md]:
      ~ for (&user.projects as $project)
        > card.elevated [key=$project.id]:
          > heading.4: $project.name <
          > text.muted:
            {$project.task_count} tasks · updated {@format_date($project.updated_at)}
          <
        <
      ~<
    < grid

    > group [layout=row gap=sm]:
      > button.primary [
          on_press=@start_edit
          disabled=&is_editing
        ]:
        &is_editing ? "Saving…" : "Edit profile"
      <
      > button.ghost [on_press=@sign_out]: Sign out <
    <
  < section
<< document

>> script [type=typescript]: {
  let user = {
    display_name: "",
    bio: "",
    joined_at: new Date(),
    projects: []
  }
  let is_editing = false

  start_edit () {
    is_editing = true
  }

  sign_out () {
    // ...
  }
}
<<
```

---

*Draft v0.4 — subject to revision as implementation reveals edge cases.*
