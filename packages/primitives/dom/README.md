# `foldkit-primitives/dom`

Element Mounts and one-shot Commands for document work. See the
[package README](../README.md) for the full guide; this page is the reference
card. ([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/dom))

## Owns

Nothing lasting. Mounts act while attached; Commands run once and report
back; the one pure function formats text.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Autofocus` | Mount: focuses on insert, emits `Focused` | element |
| `InputMask` | Mount: masks a field, emits `Input { value, raw }` | `{ pattern }` (`#`/`A`/`*`, ASCII) |
| `applyMask` | pure: value + pattern → masked and raw | — |
| `copyText` | Command: `Copied` / `CopyFailed` | text |
| `share` | Command: `Shared` / `Dismissed` / `ShareFailed` | `{ title?, text?, url? }` |
| `loadScript` | Command: `Loaded` / `LoadFailed`, idempotent by URL | `src` |

`Focused` means requested — a non-focusable element may decline. Dismissal
is its own outcome, not a failure. Concurrent script loads share one tag
and its fate; dead tags are removed so retries fetch afresh.

## Example

Standalone Commands map into the parent union through a wrapper variant:

```ts
import { mapMessage } from 'foldkit/command'
import { ClipboardMessage, copyText } from 'foldkit-primitives/dom'

const KeyClipboardMessage = defineMessageUnion({
  Key: { key: Schema.String },
  Clipboard: { message: ClipboardMessage },
})

commands: [
  mapMessage(copyText(model.lastKey), message =>
    KeyClipboardMessage.Clipboard({ message }),
  ),
],
```

## Failure

Missing capabilities yield failure Messages, never throws — denial,
insecure contexts, SSR, and network errors alike.
