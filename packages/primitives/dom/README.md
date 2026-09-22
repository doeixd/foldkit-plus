# `foldkit-primitives/dom`

Element Mounts and one-shot Commands for document work. See the [package
README](../README.md) for the full guide; this page is the reference card.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/dom))

## Owns

Nothing lasting. Mounts act while attached; Commands run once and report back; the one
pure function formats text.

## First example

```text
intent → update → Command → result Message → update → feedback
```

```ts
import { mapMessage } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { ClipboardMessage, copyText } from 'foldkit-primitives/dom'

const Message = defineMessageUnion({
  CopyClicked: {},
  Clipboard: { message: ClipboardMessage },
})
type Model = { readonly text: string; readonly status: string }

const update = (model: Model, message: typeof Message.Type) => {
  if (message._tag === 'CopyClicked') {
    return {
      model,
      commands: [mapMessage(copyText(model.text), message => Message.Clipboard({ message }))],
    }
  }
  return {
    model: {
      ...model,
      status: message.message._tag === 'Copied' ? 'Copied' : message.message.message,
    },
  }
}
```

`copyText` describes a Command; returning it from `update` lets the runtime execute the
clipboard write. The wrapper keeps the result inside the parent Message union. Handle
success and failure in the same reducer so the view can display feedback. Wire
`CopyClicked` to your copy button.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Autofocus` | Mount: focuses on insert, emits `Focused` | element |
| `InputMask` | Mount: masks a field, emits `Input { value, raw }` | `{ pattern }` (`#`/`A`/`*`, ASCII) |
| `applyMask` | pure: value + pattern → masked and raw | — |
| `copyText` | Command: `Copied` / `CopyFailed` | text |
| `share` | Command: `Shared` / `Dismissed` / `ShareFailed` | `{ title?, text?, url? }` |
| `loadScript` | Command: `Loaded` / `LoadFailed`, idempotent by URL | `src` |

`Focused` means requested — a non-focusable element may decline. Dismissal is its own
outcome, not a failure. Concurrent script loads share one tag and its fate; dead tags
are removed so retries fetch afresh.

## Failure

Missing capabilities yield failure Messages, never throws — denial, insecure contexts,
SSR, and network errors alike.
