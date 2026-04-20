# Getting Started with `solid-jotlang`

A step-by-step guide to building your first reactive UI with JOTL on top of
SolidJS. By the end you'll have:

- A new Vite project that compiles `.jot` files to Solid components
- A working counter with signals, effects, and event handlers
- A multi-component file with props, control flow, and scoped styles
- Optional SEO metadata via `solid-meta`

If you already know your way around Vite + Solid, jump straight to
[§3 Wire up the Vite plugin](#3-wire-up-the-vite-plugin).

---

## 0. What you'll need

| | |
|---|---|
| Node.js | 18 or newer |
| A package manager | `npm`, `pnpm`, or `yarn` — examples use `npm` |
| An editor | VS Code or Cursor recommended (install the `jotlang-language` extension for highlighting) |

You do **not** need to install JOTL globally. Everything lives inside your
project's `node_modules`.

---

## 1. Create a new Vite project

```bash
npm create vite@latest my-jotl-app -- --template solid-ts
cd my-jotl-app
npm install
```

This gives you a stock SolidJS + TypeScript starter. We'll add JOTL on top.

---

## 2. Install `solid-jotlang`

```bash
npm install solid-jotlang
```

`solid-jotlang` declares `solid-js` and `vite` as peer dependencies — both
already exist in the Solid template, so nothing else is needed.

> **Optional:** if you want SEO metadata (`<title>`, `<meta>`) emitted from
> JOTL `>> meta:` directives, also install `solid-meta`:
>
> ```bash
> npm install solid-meta
> ```
>
> The Vite plugin auto-detects whether `solid-meta` is available and lowers
> meta directives accordingly. With it installed, you get real `<head>` tags;
> without it, `>> meta:` is silently dropped (with a one-time console
> warning).

---

## 3. Wire up the Vite plugin

Open `vite.config.ts` and replace the contents:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import solidJotlang from 'solid-jotlang/vite'

export default defineConfig({
  plugins: [
    // solidJotlang() must come BEFORE solid() so .jot is rewritten to TSX first.
    solidJotlang(),
    solid({
      // Tell vite-plugin-solid to also process .jot files (now TSX).
      extensions: ['.jot'],
    }),
  ],
})
```

The order matters: `solidJotlang()` rewrites every `.jot` file into a TSX module
that `vite-plugin-solid` then compiles into Solid runtime calls. With
`enforce: 'pre'` set internally, the plugin always runs first regardless of
the array order — but keeping `solidJotlang()` listed first is the convention.

---

## 4. Tell TypeScript about `.jot` modules

Create `src/jot.d.ts`:

```ts
declare module '*.jot' {
  import type { Component } from 'solid-js'
  const component: Component<any>
  export default component
}
```

This silences `Cannot find module './Counter.jot'` errors in your editor.
The Vite plugin handles the actual compile.

> Already importing one of `solid-jotlang`'s ambient types? You can re-export
> the bundled declaration instead:
>
> ```ts
> /// <reference types="solid-jotlang/dist/jotl.d.ts" />
> ```

---

## 5. Write your first component

Create `src/Counter.jot`:

```jotl
>> component Counter:
  >> props: {
    initial: number
  }

  >> script [type=typescript]: {
    import { signal } from "solid-js"

    let count = signal(props.initial)

    increment () {
      count = count() + 1
    }

    reset () {
      count = 0
    }
  }
  <<

  >> document:
    > heading.1: Counter <
    > text: Clicks: &count <
    > group:
      > button [on_press=@increment]: Add <
      > button [on_press=@reset]: Reset <
    < group
  << document
<< component
```

Three things to notice:

1. **`>> component Counter:`** wraps the props, script, and document into a
   single exported function called `Counter`.
2. **`signal(...)`** declares a reactive value. Inside the script body,
   assignments (`count = count() + 1`) become setter calls automatically.
3. **`&count`** in markup reads the signal — the compiler unwraps it to
   `{count()}`. **`@increment`** binds the local function as the handler.

---

## 6. Mount the component

Replace `src/index.tsx` (or `src/main.tsx` — Solid's template uses
`index.tsx`):

```tsx
// src/index.tsx
import { render } from 'solid-js/web'
import Counter from './Counter.jot'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

render(() => <Counter initial={0} />, root)
```

Then run:

```bash
npm run dev
```

Open the printed URL — you should see the counter, and "Add" should bump the
number while "Reset" zeros it.

---

## 7. The reactivity contract

`solid-jotlang` is **explicit**. Anything you want to be reactive must be
created with one of these helpers, all imported from `solid-js`:

| You write | Compiler emits |
|---|---|
| `let count = signal(0)` | `const [count, setCount] = createSignal(0)` |
| `let total = memo(() => a() + b())` | `const total = createMemo(() => a() + b())` |
| `let user = resource(fetchUser)` | `const [user] = createResource(fetchUser)` |
| `effect(() => console.log(count()))` | `createEffect(() => console.log(count()))` |
| `count = count() + 1` | `setCount(count() + 1)` |

Reads always look like function calls — `count()` in expressions, exactly the
Solid convention. Writes look like ordinary assignments because the compiler
rewrites them. That means inside a JOTL `>> script:` block you can keep
writing imperative-looking code; the lowering happens at build time.

In markup, you have three reference sigils:

| Sigil | Meaning | Example |
|---|---|---|
| `&name` | Read a value (signals are auto-called) | `> text: &count <` |
| `@name` | Bind a handler (function reference) | `[on_press=@increment]` |
| `$name` | Bind a slot/iteration alias | `~ for (&items as $item)` |

---

## 8. Multiple components per file

A single `.jot` file can declare any number of components. The first one
becomes the default export; all are also named exports.

```jotl
>> component Avatar:
  >> props: {
    name: string
    src: string
  }

  >> document:
    > image [src=&props.src alt=&props.name] <
    > text: {props.name} <
  << document
<< component

>> component Card:
  >> props: {
    title: string
  }

  >> document:
    > heading.2: {props.title} <
    > text: Card body goes here. <
  << document
<< component
```

Use either form on the import side:

```ts
import Avatar, { Card } from './Profile.jot'
```

If a file has **no** `>> component:` blocks but does have a top-level
`>> document:`, the compiler synthesises a default component called
`Default` — so the simplest case is zero ceremony:

```jotl
>> document:
  > heading.1: Hello <
  > text: This is the world's smallest JOTL component. <
<< document
```

```ts
import Hello from './hello.jot'
```

---

## 9. Control flow

JOTL's `~ if` / `~ elif` / `~ else` / `~ for` lower into Solid's
flow components, which means a single signal update only re-renders the
branch that changed.

```jotl
>> component Greeting:
  >> props: {
    name?: string
  }

  >> script: {
    import { signal } from "solid-js"
    let isOpen = signal(false)

    toggle () {
      isOpen = !isOpen()
    }
  }
  <<

  >> document:
    > button [on_press=@toggle]: Toggle <

    ~ if (&isOpen)
      > text: Hello, {props.name ?? "stranger"}! <
    ~ else
      > text: (closed) <
    ~<
  << document
<< component
```

The compiler emits `<Show when={isOpen()} fallback={...}>...</Show>` —
fine-grained, no diff.

For lists:

```jotl
>> component TodoList:
  >> script: {
    import { signal } from "solid-js"
    let items = signal(["milk", "bread", "eggs"])
  }
  <<

  >> document:
    > stack:
      ~ for (&items as $item)
        > text: • {$item} <
      ~<
    < stack
  << document
<< component
```

…lowers to `<For each={items()}>{(item) => <p>{'• ' + item}</p>}</For>`.

---

## 10. Scoped styles

`>> style:` blocks emit CSS that's scoped to the file via a stable hash
and injected once per page on the first mount.

```jotl
>> component Hero:
  >> document:
    > section [class=hero]:
      > heading.1: Welcome <
    < section
  << document

  >> style: {
    .hero {
      padding: 4rem 2rem;
      background: linear-gradient(120deg, #4f46e5, #06b6d4);
      color: white;
    }
  }
  <<
<< component
```

The runtime helper `ensureGlobalStyle(id, css)` skips re-injection if the
`<style>` already exists in `<head>`, so SSR + hydration stays consistent.

> Want raw CSS at the file level (not per-component)? Put `>> style:` at the
> top of the file instead of inside a component.

---

## 11. Page metadata (optional `solid-meta`)

If you've installed `solid-meta`, top-level `>> meta:` directives are
lowered into `<MetaProvider>` + `<Title>` / `<Meta>` / `<Link>`:

```jotl
>> meta [
  title="My Counter App"
  description="A tiny demo of solid-jotlang"
  charset="utf-8"
  viewport="width=device-width, initial-scale=1"
  og_title="Counter"
  twitter_card="summary"
  canonical="https://example.com/counter"
]

>> document:
  > heading.1: Counter <
<< document
```

> **Why `og_title` instead of `og:title`?** JOTL attribute keys are plain
> identifiers (no dots or colons). The compiler rewrites `og_*` into
> `<Meta property="og:*">` and `twitter_*` into `<Meta name="twitter:*">`.

If `solid-meta` is **not** installed, the directive is dropped and you'll see
a friendly one-time console warning during development.

---

## 12. Editor support

Install the **JOTLANG Language Support** extension to get syntax highlighting,
diagnostics, and hover tips for `.jot` files in VS Code or Cursor:

```bash
code --install-extension jotl.jotlang-language
# or
cursor --install-extension jotl.jotlang-language
```

If you're using Helix, Zed, or Neovim, see `packages/lsp/README.md` for the
LSP wiring snippets — `jotlang-lsp` is also published as a standalone binary.

---

## 13. Project layout

A typical `solid-jotlang` project ends up looking like this:

```
my-jotl-app/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── jot.d.ts          # ambient .jot module declaration
    ├── index.tsx         # entry point, calls render(...)
    ├── App.jot           # top-level component
    ├── components/
    │   ├── Counter.jot
    │   ├── TodoList.jot
    │   └── Card.jot
    └── styles/
        └── globals.css
```

You can mix `.jot`, `.tsx`, `.jsx`, and `.ts` freely — `.jot` modules
export normal Solid components, so they're indistinguishable to consumers.

---

## 14. Troubleshooting

**“Cannot find module './X.jot' or its corresponding type declarations.”**
Add the ambient declaration from §4, or reference
`solid-jotlang/dist/jotl.d.ts` from your `tsconfig.json` `types` array.

**“Unknown directive `>> something`”**
You're hitting a JOTL parser error. The grammar is documented in
`spec/RULEBOOK.md`. The most common slip-ups are:

- Forgetting `<<` to close a directive (`>> script: { ... }` needs a `<<`)
- Mixing `>` (block) and `/>` (inline) close tokens
- Putting JS code outside a `>> script:` body

**“The page renders, but my signal never updates.”**
Check that you're *reading* the signal as a function call: `count()` in TS
expressions, `&count` in JOTL markup. A bare `count` is the signal getter
itself, not its current value.

**“`solid-meta` warning shows up in production.”**
Either install `solid-meta`, or pass `meta: 'noop'` to `solidJotlang()` in your
Vite config to suppress the warning intentionally.

```ts
solidJotlang({ meta: 'noop' })
```

**“HMR isn't working on .jot edits.”**
The plugin invalidates the module on every save and forces a full reload of
the affected component. This is by design for v0.5; preserving signal state
across HMR is a v0.6 goal. Refresh the browser if you need a clean slate.

---

## 15. Where to go next

- **`packages/solid-jotlang/README.md`** — the full reference for the package
- **`docs/index.html`** — the *Learning JOTL* tutorial, including §16 on
  reactivity with Solid
- **`spec/RULEBOOK.md`** — the authoritative grammar and the appendix on
  `>> component:` and `>> props:`
- **`packages/solid-jotlang/tests/examples/`** — five end-to-end fixtures
  (counter, multi-component, control flow, implicit default, meta) with
  their expected TSX output side-by-side
- **`examples/solid-counter/`** — a runnable Vite project you can copy

Happy hacking. If you hit something the docs don't cover, open an issue with
your `.jot` source and the behaviour you expected.
