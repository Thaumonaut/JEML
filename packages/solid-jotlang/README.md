# solid-jotlang

A SolidJS compiler for [JOTL](https://github.com/jekdev/jotl) — write reactive,
component-based interfaces in JOTL's whitespace-sigil syntax and ship them as
fine-grained reactive [SolidJS](https://www.solidjs.com/) components.

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
  }
  <<

  >> document:
    > heading.1: Counter <
    > text: Clicks: &count <
    > button [on_press=@increment]: Add <
  << document
<< component
```

## Why

`jotl` (the standalone compiler) emits static HTML and a tiny runtime —
ideal for documents, marketing sites, and progressively enhanced pages.

`solid-jotlang` takes the same `.jot` source and emits **SolidJS
components** instead, so you get:

- Fine-grained reactivity (no virtual DOM diff)
- Real signals, memos, effects, and resources
- Idiomatic Solid control flow (`<Show>`, `<Switch>`, `<For>`)
- Components, props, slots, and a full SPA build pipeline via Vite

The compiler is opinionated about reactivity but small in surface area: the only
new directive is `>> component:`, and the only new convention is that signals
are explicit (`let x = signal(0)`).

## Install

```bash
npm install solid-jotlang solid-js vite vite-plugin-solid -D
```

> New to `solid-jotlang`? The [**Getting Started guide**](./GETTING_STARTED.md)
> walks you through a brand-new project, from `npm create vite` to a working
> reactive counter with scoped styles and SEO meta tags.


`solid-js` and `vite` are peer dependencies. `vite-plugin-solid` handles the
JSX-to-DOM transform and is required.

## Usage with Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import solidJotlang from 'solid-jotlang/vite'

export default defineConfig({
  plugins: [
    solidJotlang(),
    solid({ extensions: ['.jot'] }),
  ],
})
```

Then import a `.jot` module like any other Solid component:

```tsx
// src/main.tsx
import { render } from 'solid-js/web'
import { Counter } from './Counter.jot'

render(() => <Counter initial={0} />, document.getElementById('root')!)
```

## Files: component-mode and document-mode

A single `.jot` file may declare any number of components. The new
`>> component Name:` directive is a **meta-wrapper** — it can contain its own
`>> props:`, `>> script:`, `>> style:`, and `>> document:` blocks.

```jotl
>> component HelloBadge:
  >> props: {
    label: string
  }

  >> document:
    > text [class=badge]: {props.label} <
  << document
<< component

>> component HelloPanel:
  >> document:
    !> HelloBadge [label="Hi there"]
  << document
<< component
```

If the file has **no** `>> component:` blocks but does have a top-level
`>> document:`, the compiler emits a single exported component called
`Default`. So the simplest case requires no extra ceremony:

```jotl
>> document:
  > heading.1: Hello <
<< document
```

```ts
import Default from './hello.jot'
```

## Reactivity contract

JOTL-Solid is **explicit** — you mark reactivity yourself, the compiler
rewrites it.

| You write                            | Compiler emits                              |
|--------------------------------------|---------------------------------------------|
| `let count = signal(0)`              | `const [count, setCount] = createSignal(0)` |
| `let total = memo(() => a() + b())`  | `const total = createMemo(() => a() + b())` |
| `let user = resource(fetchUser)`     | `const [user] = createResource(fetchUser)`  |
| `effect(() => console.log(count()))` | `createEffect(() => console.log(count()))`  |
| `count = count() + 1`                | `setCount(count() + 1)`                     |

Reads call the signal — `count()` in expressions, exactly the Solid
convention. Writes look like ordinary assignments because the compiler rewrites
them to setter calls.

Inside JOTL markup, `&count` automatically calls the signal:

```jotl
> text: Clicks: &count <
```

…compiles to roughly:

```tsx
<p>Clicks: {count()}</p>
```

ES `import` statements at the top of a `>> script:` body are hoisted to the
module prelude.

## Control flow

JOTL's control sigils lower to Solid's flow components:

| JOTL                                | Solid                                                   |
|-------------------------------------|---------------------------------------------------------|
| `~ if (&isOpen)` … `~<`             | `<Show when={isOpen()}>…</Show>`                        |
| `~ if … ~ elif … ~ else … ~<`       | `<Switch><Match …>…</Match></Switch>`                   |
| `~ for (&items as $item)` … `~<`    | `<For each={items()}>{(item) => …}</For>`               |

This means a single signal change updates only the affected node — no
component-level re-render.

## What gets emitted

`compile(source, { id })` returns a `{ code, map? }` pair where `code` is
plain ECMAScript (with JSX) — no TypeScript syntax, so it travels cleanly
through Vite's SSR transform and any other tool that doesn't strip types.

Per-file output:

- **Top-level `>> script:`** is emitted at module scope, after any hoisted
  imports.
- **Top-level `>> style:`** is wrapped in a one-shot `ensureGlobalStyle(...)`
  helper that injects the CSS into `<head>` once per page.
- **`>> component Name:`** becomes `export function Name(props) { … }`.
- **`>> props:`** is emitted as a JSDoc `@typedef` and `@param` on the
  component, so editors get type hints without any TypeScript syntax in the
  output.

## Programmatic API

```ts
import { compile, compileAst } from 'solid-jotlang'

const { code } = compile(source, { id: 'Counter.jot' })
```

`compileAst` accepts an already-parsed JOTL AST (from `jotl`) when you
want to share parsing cost across passes.

## Status

Public preview. The grammar is stable (it's the same JOTL the standalone
compiler accepts) but the codegen is iterating — if you build something with
this, please open an issue with the JOTL source and the output you expected.
