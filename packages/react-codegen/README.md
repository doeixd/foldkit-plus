# foldkit-react-codegen

Handing off a Foldkit design system to a React team—or sharing presentational views with an existing React app—usually forces you to rewrite every view into JSX by hand. Worse, embedding a full Foldkit runtime is unnecessary when React already owns component state.

`foldkit-react-codegen` compiles pure Foldkit view functions (`view(model, h: HtmlBuilder<Message>): Html`) directly into React TSX source (`view(model, dispatch: (message: Message) => void): ReactNode`). Operating on the TypeScript AST, it preserves your variable names, helpers, control flow, and imports while refusing unsupported runtime constructs with file-and-line diagnostics.

Use `foldkit-react-codegen` for pure presentational markup, attributes, and events; use [`foldkit-react`](../react/README.md) when you need `Model`, `update`, Commands, Subscriptions, or Mounts running inside React.

## Install

```sh
pnpm add -D foldkit-react-codegen typescript
```

## A first compiled view

Write a Foldkit view module using `HtmlBuilder`:

```ts
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'

export type Model = { readonly saving: boolean }
export const Message = defineMessageUnion({ Saved: {} })
export type Message = typeof Message.Type

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.button([h.Class('save'), h.Disabled(model.saving), h.OnClick(Message.Saved())], ['Save'])
```

Run the compiler over your source directory:

```sh
pnpm foldkit-react-codegen src --out-dir generated
```

The compiler writes the equivalent React JSX module with `h` rewritten to `dispatch`:

```tsx standalone
import type { ReactNode } from 'react'
import { defineMessageUnion } from 'foldkit/message'

type Model = { readonly saving: boolean }
const Message = defineMessageUnion({ Saved: {} })
type Message = typeof Message.Type

export const view = (model: Model, dispatch: (message: Message) => void): ReactNode => (
  <button className={'save'} disabled={model.saving} onClick={() => dispatch(Message.Saved())}>
    Save
  </button>
)
```

Every function taking an `HtmlBuilder` parameter compiles into a React view taking `dispatch`, helper calls like `row(item, h)` rewrite to `row(item, dispatch)`, `h.<tag>` calls become JSX elements, and non-view helper modules copy into `generated/` so relative imports resolve. Import the generated `view` into any React component with JSX enabled (run your formatter over `generated/` if committing output):

```tsx
import { useState } from 'react'

export const SaveButtonView = (props: {
  readonly initialModel: Model
  readonly next: (model: Model, message: Message) => Model
}) => {
  const [model, setModel] = useState(props.initialModel)
  return view(model, message => setModel(current => props.next(current, message)))
}
```

## Verify generated output in React

After codegen, typecheck the consuming React project and render the generated component. With `saving: true` the button renders disabled; when enabled, clicking calls `dispatch(Message.Saved())`. Keep generated output in its own directory, and check CLI diagnostics before testing output in watch mode because failed builds keep the previous valid file on disk.

## Supported Foldkit constructs

| Foldkit construct | React output |
| --- | --- |
| `h.div(attrs, children)` / HTML, SVG, MathML tags | `<div ...>...</div>` |
| `h.keyed('li')(key, attrs, children)` | `<li key={key} ...>` |
| `h.empty` | `null` |
| `h.submodel({ model, view, toParentMessage })` | `view(model, ..., m => dispatch(toParentMessage(m)))` |
| `Submodel.defineView<Model, Message>(...)` | Compiled view with `Model` preserved |
| `createLazy()` / `createKeyedLazy()` slots | Direct `view(...)` call (slot removed) |
| Custom element `spec.withMessage(h)` | JSX tag with props and `on<event>` handlers |
| `Class`, `Id`, `Key`, `For`, `Tabindex`, `Readonly` | `className`, `id`, `key`, `htmlFor`, `tabIndex`, `readOnly` |
| `AriaLabelledBy(x)` and `Aria*` | `aria-labelledby={x}` and matching `aria-*` props |
| `Attribute('k', v)` / `DataAttribute('k', v)` | `k={v}` / `data-k={v}` |
| `Style({ 'background-color': c })` | `style={{ backgroundColor: c }}` |
| `OnClick(msg)` / focus / mouse / `OnDoubleClick` | `onClick={() => dispatch(msg)}` |
| `OnInput(f)` | `onChange={e => dispatch(f(e.currentTarget.value))}` |
| `OnKeyDown(f)` / `OnKeyUp(f)` | `onKeyDown` / `onKeyUp` with modifier flags |
| `OnKeyDownSelf(f)` | `onKeyDown` guarded by `target === currentTarget` |
| `OnSubmit(msg)` | `onSubmit` calling `preventDefault()` then `dispatch` |

- **Custom elements:** React 19 sets properties and attaches `on<event>` listeners matching `CustomEvent.detail`. Define custom elements before React renders them, and note the compiler appends a `declare module 'react'` augmentation typing each tag's props as `Record<string, unknown>`. Unused local element specs are stripped from generated files.
- **Controlled inputs:** `OnInput` maps intentionally to React's `onChange`, which fires on every native `input` event and avoids controlled-input warnings when paired with `value`.

## Diagnostics when compilation refuses a construct

When a view uses an unsupported construct, the CLI prints `file:line:column - error CODE: message`, writes no output, and exits with status 1:

- **`FKREACT0001`:** `h.submodel` missing a literal `{ model, view, toParentMessage }` object, or `h.keyed` with a computed tag name.
- **`FKREACT0002`:** Unsupported attributes lacking a faithful React equivalent (`OnMount`, `OnUnmount`, native `OnChange`, `InnerHTML`, or unlisted attributes).
- **`FKREACT0003`:** Non-literal attribute arrays, spreads inside attribute arrays, or attribute helpers built outside an element call.
- **`FKREACT0004`:** Assigning or passing `h` to anything other than calling it or passing it directly to a helper view.
- **`FKREACT0005`:** Click modifier options, non-literal `Style` objects, or computed `Attribute` names.
- **`FKREACT0006`:** Lazy slots stored or invoked outside `const slot = createLazy()` and a direct `slot(...)` call.
- **`FKREACT0007`:** Custom element specs that are not inline `CustomElement.define({ tag, properties, events })` declarations or bound outside `spec.withMessage(h)`.

Keep components needing these features in Foldkit and embed them with [`foldkit-react`](../react/README.md).

## Semantic differences in React output

- **Lazy Message construction:** Foldkit builds Message values during render; compiled handlers build them when the event fires (equivalent for pure constructors).
- **Direct calls without memo slots:** Lazy slots compile to direct calls (wrap callers in `React.memo` if needed), `slotId` disappears, and unused Foldkit runtime imports are stripped.
- **List keys:** React warns on unkeyed arrays; use `h.keyed` or `h.Key` in lists intended for React compilation.

## CLI flags

Run `foldkit-react-codegen <file-or-directory>... --out-dir <directory>` with optional flags:

- `--root-dir <directory>`: Base path for relative output structure under `--out-dir` (defaults to working directory).
- `--watch`: Recompiles on changes, keeping the last valid build on diagnostics and ignoring its own output writes.
- `--source-map`: Emits `<output>.tsx.map` with `sourceMappingURL` mapping JSX nodes back to Foldkit source lines.

Files without views copy through (preserving relative imports), unchanged byte output skips disk writes, and `.d.ts` / `.test.ts` files are ignored.

## Programmatic API

```ts
import { formatDiagnostic, generate, transformSourceFile, watch } from 'foldkit-react-codegen'

const sourceText = `
import type { Html, HtmlBuilder } from 'foldkit/html'
export const view = (model: { title: string }, h: HtmlBuilder<never>): Html =>
  h.h1([], [model.title])
`
const result = transformSourceFile('src/Title.ts', sourceText, { sourceMap: true })
if (result.ok) {
  console.log(result.code, result.map)
} else {
  result.diagnostics.map(formatDiagnostic).forEach(line => console.error(line))
}

await generate({ inputs: ['src'], outDir: 'generated' })

const watcher = watch({ inputs: ['src'], outDir: 'generated' }, event => {
  if (event._tag === 'Generated') console.log(event.result.written)
})
watcher.close()
```

`transformSourceFile` is pure. Note that `--source-map` relies on TypeScript compiler printer internals and throws an error on unsupported TypeScript versions rather than writing broken maps.

## Limits

`OnMount` and `OnUnmount` lifecycle attributes are unsupported in compiled JSX views; host those components via [`foldkit-react`](../react/README.md).

## Next

- Embed full Foldkit programs or React islands at runtime: [`foldkit-react`](../react/README.md)
- See both codegen and runtime embedding working together: [`examples/react`](../../examples/react)
