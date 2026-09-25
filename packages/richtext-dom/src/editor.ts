/**
 * The editor's Message vocabulary and the mount that produces it (§§31, 118).
 *
 * The DOM adapter reports what the browser asked for as commands, a caret, and a
 * history chord. This is what those mean to an editor's `update`, so one set of
 * Messages arrives whether a person typed, pasted, or moved the caret. The Bundle
 * proof in `controlled.ts` consumed these by hand; `events` is where the browser
 * produces them.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import * as RichText from 'foldkit-richtext'
import { attachmentIn, mountInto, releaseMount, renderingFor } from './host.js'

export const Message = defineMessageUnion({
  Typed: { text: Schema.String },
  Backspace: {},
  DeletedForward: {},
  Entered: {},
  ToggledMark: { mark: Schema.String },
  RetypedBlock: { block: RichText.TextBlock },
  Selected: { selection: Schema.NullOr(RichText.Selection) },
  Pasted: { slice: RichText.Slice },
  Undone: {},
  Redone: {},
  /** The patch Command's completion: Foldkit Commands report a Message, and a
   *  render has nothing to say beyond that it happened. */
  Patched: {},
})
export type Message = typeof Message.Type

/**
 * What the DOM can ask for: the vocabulary without the patch acknowledgement,
 * which only the Command produces. The adapter's stream is typed by this, so a
 * mount's result union names every Message it can actually emit.
 */
export type EditorEvent = Exclude<Message, { readonly _tag: 'Patched' }>

/**
 * What a browser intent means to an editor. The adapter reports only plain
 * insertions, so an insertion carrying marks is refused rather than quietly
 * losing them: what a marked insertion means is the editor's decision, not the
 * adapter's, and the adapter never has one to report.
 */
export const toMessage = (command: RichText.Command): EditorEvent | undefined => {
  switch (command.type) {
    case 'InsertText':
      return command.marks === undefined ? Message.Typed({ text: command.text }) : undefined
    case 'DeleteBackward':
      return Message.Backspace()
    case 'DeleteForward':
      return Message.DeletedForward()
    case 'SplitBlock':
      return Message.Entered()
    case 'ToggleMark':
      // The adapter toggles by name; a mark value carrying props is not
      // expressible as a toggle, so it is refused rather than stripped.
      return typeof command.mark === 'string'
        ? Message.ToggledMark({ mark: command.mark })
        : undefined
    case 'Paste':
      return Message.Pasted({ slice: command.slice })
    default:
      return undefined
  }
}

/**
 * Attaches the translation to a host element and reports each Message through
 * `emit`. Separate from the mount so a test can drive the DOM without pulling a
 * stream, and so a caller embedding the editor directly can hand it a rendering
 * registry.
 */
export const attachEditor = (
  host: Element,
  content: RichText.Document,
  emit: (message: EditorEvent) => void,
  rendering: RichText.Rendering = RichText.noRendering,
) =>
  mountInto(
    host,
    content,
    {
      onIntent: command => {
        const message = toMessage(command)
        if (message !== undefined) emit(message)
      },
      onHistory: direction => emit(direction === 'undo' ? Message.Undone() : Message.Redone()),
      onSelection: selection => emit(Message.Selected({ selection })),
    },
    rendering,
  )

/**
 * The patch Command's work: find the element the view gave an id to and sync the
 * attachment it holds. A missing host is not an error — the editor went away
 * while the transition was in flight — so it reports whether it patched.
 */
export const patchEditor = (
  hostId: string,
  state: RichText.EditorState,
  changeSet: RichText.ChangeSet,
): boolean => {
  const host = document.getElementById(hostId)
  if (host === null) return false
  const attachment = attachmentIn(host)
  if (attachment === undefined) return false
  attachment.sync(state, changeSet)
  return true
}

/** The editor's events as a mount: one attachment per element, released with it.
 *  The rendering registry is looked up by the host id the placement recorded
 *  (§122), so it reaches the mount without entering a Model or a mount's args. */
export const events = Mount.defineStream('RichTextDomEvents', {
  args: { content: RichText.Document },
  messages: [
    Message.Typed,
    Message.Backspace,
    Message.DeletedForward,
    Message.Entered,
    Message.ToggledMark,
    Message.RetypedBlock,
    Message.Selected,
    Message.Pasted,
    Message.Undone,
    Message.Redone,
  ],
  execute: ({ element, content }) =>
    Stream.callback<EditorEvent>(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          attachEditor(
            element,
            content,
            message => Queue.offerUnsafe(queue, message),
            renderingFor(element.id),
          ),
        ),
        () => Effect.sync(() => releaseMount(element)),
      ),
    ),
})
