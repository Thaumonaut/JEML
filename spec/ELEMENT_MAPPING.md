# JEML → HTML Element Mapping (v0.4)

This document defines how JEML tags compile to HTML elements. The compiler uses this as its authoritative reference.

**Note on syntax:** This document uses v0.4 syntax with `>>`/`<<` directives, `>`/`<` blocks, `/>`/`</` inline, and `!>` void elements. See RULEBOOK for syntax rules.

## Block elements

| JEML tag | HTML element | Notes |
|----------|--------------|-------|
| `heading.N` (N=1-6) | `<hN>` | Variant selector determines level; default level is 1 |
| `text` | `<p>` | Base tag |
| `text.lead` | `<p class="lead">` | |
| `text.muted` | `<p class="muted">` | |
| `text.caption` | `<p class="caption">` | |
| `section` | `<section>` | |
| `nav` | `<nav>` | |
| `header` | `<header>` | |
| `footer` | `<footer>` | |
| `aside` | `<aside>` | |
| `main` | `<main>` | |
| `article` | `<article>` | |
| `list` | `<ul>` | Default (bullet) |
| `list.bullet` | `<ul>` | Same as default |
| `list.number` | `<ol>` | |
| `list.none` | `<ul class="list-none">` | |
| `table` | `<table>` | |
| `columns` (inside `table`) | `<thead><tr>` wrapper; each `-` item becomes `<th>` | |
| `row` (inside `table`) | `<tr>` inside `<tbody>` | |
| `form` | `<form>` | |
| `button` | `<button>` | |
| `button.primary` | `<button class="primary">` | |
| `button.secondary` | `<button class="secondary">` | |
| `button.ghost` | `<button class="ghost">` | |
| `button.danger` | `<button class="danger">` | |
| `button.sm` / `.md` / `.lg` | Size class appended | Stackable with style variants |
| `card` | `<div class="jeml-card">` | |
| `card.elevated` | `<div class="jeml-card elevated">` | |
| `card.bordered` | `<div class="jeml-card bordered">` | |
| `card.flat` | `<div class="jeml-card flat">` | |
| `stack` | `<div class="jeml-stack">` | Layout utility |
| `row` (outside table) | `<div class="jeml-row">` | |
| `grid` | `<div class="jeml-grid">` | |
| `group` | `<div class="jeml-group">` | |
| `block` | `<div>` | Generic container |
| `link` | `<a>` | Block-level link; use `#'...'` for inline |
| `links` (inside `nav`) | `<ul>`, each `-` item becomes `<li>` | |
| `brand` (inside `nav`) | `<div class="jeml-brand">` | |
| `code` | `<pre><code>` wrapper | For fenced blocks with body |

## Inline elements

| JEML tag | HTML element | Notes |
|----------|--------------|-------|
| `/> strong: ... </` / `**text**` | `<strong>` | |
| `/> em: ... </` / `_text_` | `<em>` | |
| `/> code: ... </` / `` `text` `` | `<code>` | |
| `/> link [url="..."]: ... </` / `#'text'[url]` | `<a>` | `url` → `href` |
| `/> span [...]: ... </` | `<span>` | |
| `/> icon [name="..."]: </` | `<i class="icon" data-icon="NAME">` | Empty-content form |
| `/> badge.VARIANT: ... </` | `<span class="jeml-badge VARIANT">` | |
| `/> avatar [src="..."]: </` | `<img class="jeml-avatar">` | Inline avatar |
| `/> time [value="..."]: ... </` | `<time>` | `value` → `datetime` |

## Void elements

| JEML tag | HTML element | Notes |
|----------|-----------------|-------|
| `!> image` | `<img>` | `url` or `src` attribute required |
| `!> field` | `<label>` wrapping input element | See field types below |
| `!> break` | `<br>` | |
| `!> spacer` | `<div class="jeml-spacer">` | `size` attribute |
| `!> divider` | `<hr>` | |
| `!> icon` | `<i class="icon">` | Block-level icon |

### Field element details (void)

The `!> field` element wraps a `<label>` plus an input whose type depends on the `type` attribute:

| `field` type | Generated HTML |
|--------------|----------------|
| `text` (default) | `<label>LABEL<input type="text" name="NAME"></label>` |
| `email` | `<label>LABEL<input type="email" name="NAME"></label>` |
| `password` | `<label>LABEL<input type="password" name="NAME"></label>` |
| `number` | `<label>LABEL<input type="number" name="NAME"></label>` |
| `date` | `<label>LABEL<input type="date" name="NAME"></label>` |
| `checkbox` | `<label><input type="checkbox" name="NAME">LABEL</label>` (input first) |
| `radio` | `<label><input type="radio" name="NAME">LABEL</label>` (input first) |
| `textarea` | `<label>LABEL<textarea name="NAME" rows="..."></textarea></label>` |
| `select` | `<label>LABEL<select name="NAME"></select></label>` |
| `file` | `<label>LABEL<input type="file" name="NAME"></label>` |

Additional field attributes pass through: `required`, `disabled`, `placeholder`, `min`, `max`, `step`, `rows`, `pattern`, `accept`. The `label` attribute becomes label text. `name` is required. `help` attribute becomes `<small class="jeml-help">` after the input.

## Attribute mappings

| JEML attr | HTML attr | Applies to |
|-----------|-----------|------------|
| `id` | `id` | all |
| `style` | `class` | all — JEML `style` is a CSS class hook, not inline style |
| `url` | `href` | links |
| `src` | `src` | images, avatars |
| `type` | `type` | fields, buttons |
| `layout` | `class` | adds `jeml-layout-ROW/COLUMN` |
| `gap` | `class` | adds `jeml-gap-SIZE` |
| `align` | `class` | adds `jeml-align-VALUE` |
| `size` | `class` | adds `jeml-size-VALUE` |
| `color` | `class` | adds `jeml-color-VALUE` |
| `columns` (on `grid`) | `class` + inline style | adds `jeml-cols-N` and `style="--cols: N"` |
| `level` (on legacy `heading`) | n/a | deprecated; use `.N` variant |
| `target`, `title`, `rel` | same | passed through on links |
| `required`, `disabled` | same | boolean attributes |
| `bind=...` | ignored in static compilation | reserved for reactivity milestone |
| `on_press`, `on_submit`, etc. | ignored in static compilation | reserved for reactivity milestone |
| `key` | ignored in static compilation | reserved for list reconciliation |

## Document structure

A compiled JEML document produces a complete HTML5 document:

```
<!DOCTYPE html>
<html>
<head>
  <!-- contents from >> meta directive -->
  <!-- contents from >> style directive (inline or <link>) -->
</head>
<body>
  <!-- contents of >> document directive -->
</body>
</html>
```

### Meta directive mapping

| JEML meta attr | HTML head element |
|----------------|-------------------|
| `title="..."` | `<title>...</title>` |
| `description="..."` | `<meta name="description" content="...">` |
| `icon="..."` | `<link rel="icon" href="...">` |
| `scale="..."` | `<meta name="viewport" content="width=device-width, initial-scale=X">` |
| any other attribute | `<meta name="KEY" content="VALUE">` |

### Style directive mapping

- `>> style [type="css" ref="path.css"]` → `<link rel="stylesheet" href="path.css">`
- `>> style [type="css"]: { ...css... } <<` → `<style>...css...</style>`

## Content rules

- Text content is HTML-escaped (`<` → `&lt;`, etc.)
- Adjacent whitespace collapses to a single space
- Line breaks in text content are spaces at render time
- `-` sibling markers inside `list`, `nav > links`, etc. produce `<li>` elements
- Comments (`%`, `%{ %}`) are stripped entirely

## Unknown tags

Unknown tag names compile to `<jeml-TAGNAME>` custom elements, with all attributes preserved. Variants on unknown tags become classes: `> foo.bar:` → `<jeml-foo class="bar">`.
