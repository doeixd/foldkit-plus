/**
 * The Markdown source editor (§8, §137): the text of a source session, what switching back
 * would lose, and the way back — drawn through slots like the rest of the chrome.
 *
 * Source mode is the application's `SourceSession | null`: a session is open while it is set,
 * and the rich editor stands still meanwhile. This view edits the session's draft and reads
 * `closeSource` for its warnings, which is a pure read, so the list is exactly what closing
 * now would report. What leaving does — commit at once, or confirm first when there are
 * warnings — is the application's `update`.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import type { Html } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { renderDocument } from 'foldkit-richtext-dom/view'
import {
  closeSource,
  type ClosedSource,
  type MarkdownDiagnostic,
  type SourceSession,
} from 'foldkit-richtext-markdown'

/** The elements the editor publishes: its wrapper, the text, the warnings, and the way back. */
export const SourceEditorSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  text: Slot.make({ capability: Capability.TextInput }),
  warnings: Slot.make({ capability: Capability.Collection }),
  warning: Slot.make({ capability: Capability.Base }),
  done: Slot.make({ capability: Capability.Interactive }),
})

export interface SourceEditorInput<Message> {
  readonly session: SourceSession
  /** The document the session was opened on, which the application still holds. */
  readonly document: RichText.Document
  /** What the text area sends as the Markdown changes: the next draft. */
  readonly drafted: (draft: string) => Message
  /** What the text area sends as its caret moves: the session's next `caret` (§147). */
  readonly moved: (caret: number) => Message
  /** What the way back sends. */
  readonly done: Message
}

/**
 * Puts a text area's caret at `caret` and focuses it, then reports each place the caret moves
 * to, as the offset of its selection's focus, until released.
 */
export const followCaret = (
  field: HTMLTextAreaElement,
  caret: number,
  report: (caret: number) => void,
): (() => void) => {
  field.focus()
  field.setSelectionRange(caret, caret)
  let last = caret
  const moved = () => {
    const at = field.selectionDirection === 'backward' ? field.selectionStart : field.selectionEnd
    if (at === last) return
    last = at
    report(at)
  }
  // A caret moves by typing, by keys, by the pointer, and by selecting; browsers that fire
  // `selectionchange` on the field itself cover all of these, and the rest are for the others.
  const events = ['selectionchange', 'select', 'input', 'keyup', 'mouseup'] as const
  for (const event of events) field.addEventListener(event, moved)
  return () => {
    for (const event of events) field.removeEventListener(event, moved)
  }
}

const CaretMoved = Schema.TaggedStruct('CaretMoved', { caret: Schema.Number })

/** `followCaret` as a Mount; its element is the source editor's text area. */
const sourceCaret = Mount.defineStream('RichTextSourceCaret', {
  args: { caret: Schema.Number },
  messages: [CaretMoved],
  execute: ({ element, caret }) =>
    Stream.callback<typeof CaretMoved.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          element instanceof HTMLTextAreaElement
            ? followCaret(element, caret, at =>
                Queue.offerUnsafe(queue, CaretMoved.make({ caret: at })),
              )
            : () => {},
        ),
        release => Effect.sync(release),
      ),
    ),
})

/** The caret Mount lifted into the caller's Messages, as the text area carries it. */
export const caretMount = <Message>(
  caret: number,
  moved: (caret: number) => Message,
): Mount.MountAction<Message> =>
  Mount.mapMessage(sourceCaret({ caret }), message => moved(message.caret))

/** A warning as a sentence; its code and detail also ride on the element for a Style. */
const describe = (diagnostic: MarkdownDiagnostic): string =>
  diagnostic.code === 'UnsupportedMark'
    ? `${diagnostic.detail} formatting has no Markdown and will be lost`
    : diagnostic.code === 'UnsafeUrl'
      ? `An unsafe ${diagnostic.detail} address will be dropped`
      : `${diagnostic.detail} has no Markdown form here and will be lost`

// A preview mints identities nobody keeps; they only have to be distinct within one parse.
const previewIds = () => {
  let next = 0
  return { mint: () => `preview-${next++}` }
}

/**
 * What closing the session now would give, as the view shows it: the warnings and the preview's
 * document. An unedited draft gives back the caller's document and warns of nothing, which is
 * `closeSource`'s rule, so it is answered without the parse `closeSource` spends placing the
 * caret. An edited draft's answer is parsed once per draft and kept: the cache is keyed by the
 * session's `unprintable` array, which stays the same object while the draft and caret are
 * replaced, so moving the caret does not parse again, and a closed session's entry is collected
 * with it.
 */
const parsed = new WeakMap<object, { readonly draft: string; readonly closed: ClosedSource }>()
const closedFor = (
  session: SourceSession,
  document: RichText.Document,
): Pick<ClosedSource, 'document' | 'diagnostics'> => {
  if (session.draft === session.printed) return { document, diagnostics: [] }
  const kept = parsed.get(session.unprintable)
  if (kept?.draft === session.draft) return kept.closed
  const closed = closeSource(session, document, previewIds())
  parsed.set(session.unprintable, { draft: session.draft, closed })
  return closed
}

/**
 * The source editor as a slot view: a text area holding the draft, then — once the draft is
 * edited — one warning per thing switching back would lose or refuse, then the way back.
 */
export const sourceEditor = <Message>(): SlotView.SlotView<
  typeof SourceEditorSlots,
  SourceEditorInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(SourceEditorSlots, (input, slots, h): Html => {
    const warnings = closedFor(input.session, input.document).diagnostics
    return h.div(slots.root.attrs(), [
      h.textarea(
        // A slot's attributes are typed for every element, and Foldkit's textarea excludes
        // `InnerHTML`; the Form and Builder families narrow the same way (none is set here).
        slots.text.attrs([
          h.AriaLabel('Markdown source'),
          h.DataAttribute('source', 'text'),
          h.Value(input.session.draft),
          h.OnInput(input.drafted),
          // Read once, when the text area is drawn: the session's caret as it opened.
          h.OnMount(caretMount(input.session.caret, input.moved)),
        ]) as Parameters<typeof h.textarea>[0],
      ),
      h.ul(
        slots.warnings.attrs([h.DataAttribute('source', 'warnings')]),
        warnings.map((warning, index) =>
          h.li(
            slots.warning.attrs(
              [h.DataAttribute('code', warning.code), h.DataAttribute('detail', warning.detail)],
              { index, id: `${warning.code}:${warning.detail}:${index}`, count: warnings.length },
            ),
            [describe(warning)],
          ),
        ),
      ),
      h.button(
        slots.done.attrs([
          h.Type('button'),
          h.DataAttribute('source', 'done'),
          h.OnClick(input.done),
        ]),
        ['Rich text'],
      ),
    ])
  })

/** The preview publishes one element: the rendered draft. */
export const SourcePreviewSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

export interface SourcePreviewInput {
  readonly session: SourceSession
  readonly document: RichText.Document
  /** How declared kinds and marks render, as in the rich editor. Defaults to `noRendering`. */
  readonly rendering?: RichText.Rendering | undefined
}

/**
 * The draft as the document it would become, for split mode: drawn beside `sourceEditor`, it
 * shows what switching back would commit. It is the read-only renderer's output, so it
 * dispatches nothing, and it shares the editor's parse of the draft.
 */
export const sourcePreview = <Message>(): SlotView.SlotView<
  typeof SourcePreviewSlots,
  SourcePreviewInput,
  Message
> =>
  SlotView.forMessages<Message>().define(SourcePreviewSlots, (input, slots, h): Html =>
    h.div(slots.root.attrs([h.DataAttribute('source', 'preview'), h.AriaLabel('Preview')]), [
      renderDocument(
        closedFor(input.session, input.document).document,
        input.rendering ?? RichText.noRendering,
      ),
    ]),
  )
