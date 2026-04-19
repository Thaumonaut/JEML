# JEML default stylesheet

`jeml.css` is the **base preset** — a small (~9 KB) classless stylesheet that ships with `@jekdev/jeml`. It styles raw HTML elements directly, plus the structural classes the compiler emits (`.jeml-grid`, `.jeml-stack`, `.jeml-group`, `.jeml-card`).

## What's in it

The foundation is **[new.css](https://newcss.net/)** by Xz (MIT-licensed) — a well-regarded classless framework that styles `<h1>`, `<p>`, `<button>`, `<table>`, etc. straight out of the box with a centered 750px content rail and built-in light/dark mode.

We've vendored it (renamed `--nc-*` tokens to `--jeml-*` for a single theming surface) and added a thin **JEML primitives layer** on top:

- `.jeml-grid` — CSS grid with author-controllable column count
- `.jeml-stack` — vertical flex with uniform gap
- `.jeml-group` — horizontal flex with uniform gap, wraps on overflow
- `.jeml-card` — bordered/padded surface
- Sibling-button gap so `> button: Add < > button: Reset <` looks right without a wrapper

The result is one inline `<style>` block per page with **zero external requests** — no font CDN, no `<link>`.

## How it gets applied

Three modes — pick whichever fits your workflow.

### 1. Automatic (the default)

The compiler injects the preset into the `<head>` of every document unless you opt out:

```jeml
>> document:
  > heading.1: Hello <
  > text: A page that looks intentional with zero CSS. <
<< document
```

### 2. Explicit opt-in

If you prefer your intent to be visible in source:

```jeml
>> style [preset=base]

>> document: ... << document
```

Functionally identical to the default, just signposted.

### 3. Opt-out + external link

For multi-page sites that want one shared stylesheet across pages:

```jeml
>> style [preset=none]
>> style [ref="/jeml.css"]
```

Copy `node_modules/@jekdev/jeml/styles/jeml.css` into your public folder, or link to a CDN copy. The browser caches it across pages.

## Cascade order

Author styles always win — the preset is emitted **first** so anything you write overrides it without `!important`:

1. `<meta>` tags
2. `<title>`
3. `<style data-jeml-preset="base">` ← the preset
4. `<link>` from `>> style [ref=...]` directives (in source order)
5. `<style>` from inline `>> style: { ... }` blocks (in source order)
6. Compiler-generated responsive scope rules

## Token reference

Every visual decision routes through a CSS custom property under the `--jeml-*` namespace. To re-skin the document, override one or more tokens:

```jeml
>> style: {
  :root {
    --jeml-lk-1: #ff6f3c;          /* punchy orange links/buttons */
    --jeml-bg-1: #fafafa;          /* warmer page background */
    --jeml-radius: 12px;           /* friendlier corners */
  }
}
```

### Color (from new.css)

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--jeml-tx-1` | `#000` | `#fff` | headings |
| `--jeml-tx-2` | `#1a1a1a` | `#eee` | body text |
| `--jeml-bg-1` | `#fff` | `#000` | page background |
| `--jeml-bg-2` | `#f6f8fa` | `#111` | code, fieldsets, blockquote, zebra rows |
| `--jeml-bg-3` | `#e5e7eb` | `#222` | borders, dividers |
| `--jeml-lk-1` | `#0070f3` | `#3291ff` | links, primary buttons |
| `--jeml-lk-2` | `#0366d6` | `#0070f3` | link hover, button hover |
| `--jeml-lk-tx` | `#fff` | `#fff` | text on link/button |
| `--jeml-ac-1` | `#79ffe1` | `#7928ca` | selection, mark |
| `--jeml-ac-tx` | `#0c4047` | `#fff` | text on selection/mark |

### Typography

| Token | Default |
|---|---|
| `--jeml-font-sans` | system stack (`-apple-system`, `BlinkMacSystemFont`, …) |
| `--jeml-font-mono` | system mono stack (`ui-monospace`, `SFMono-Regular`, …) |

Heading sizes (`h1`–`h6`) are not exposed as tokens; override the selectors directly if you need a different scale.

### JEML primitives

| Token | Default | Purpose |
|---|---|---|
| `--jeml-gap-sm` | `0.5rem` | sibling-button gap, `.jeml-group` gap |
| `--jeml-gap-md` | `1rem` | `.jeml-grid` and `.jeml-stack` gap |
| `--jeml-gap-lg` | `1.5rem` | `.jeml-card` padding |
| `--jeml-radius` | `6px` | `.jeml-card` corners |

## Dark mode

Dark mode is automatic via `prefers-color-scheme: dark`. To force it on regardless of system preference, set `data-theme="dark"` on `<html>` or any ancestor:

```html
<html data-theme="dark">...</html>
```

To force light mode, use `data-theme="light"` (this overrides the OS preference).

Re-skinning works identically in dark mode — override tokens inside a `[data-theme="dark"]` block:

```css
[data-theme="dark"] {
  --jeml-lk-1: #8896ff;
}
```

## Forking the stylesheet

If you outgrow the preset, copy `jeml.css` into your project, opt out (`>> style [preset=none]`), link to your fork, and edit freely. There's nothing magical about it — it's plain CSS targeting the same selectors the compiler emits.

## Credits

Foundation: [new.css](https://newcss.net/) by Xz, MIT License — https://github.com/xz/new.css/blob/master/LICENSE

JEML primitives layer and integration © the JEML project, MIT.

## What's intentionally not in here

- **No icon font / SVG sprite.** `.icon` gets baseline sizing (`1em`, `currentColor`); wire up Lucide, Heroicons, or your own sprite.
- **No animation library, no utility classes.** This is not Tailwind. If you want utilities, layer them on yourself.
- **No external font CDN.** new.css's upstream `@import` for Inter is removed; we use the system font stack to keep output self-contained. Add an `@import` from your own `>> style: { ... }` block if you want a webfont.
- **No print, RTL, or reduced-motion blocks.** Easy to add per-project; deliberately omitted from the default to keep the file small.
