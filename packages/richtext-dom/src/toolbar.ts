/**
 * The marks toolbar (§35, §119): a button per mark, dispatching the same Messages
 * a chord does. It is the application's chrome, not the editor's — §29 gives the
 * editor the `contenteditable` subtree and the application everything around it —
 * so this renders a value the application places beside the editor's host, and it
 * never touches the DOM the editor owns. A Mixins slot family wraps these buttons
 * when an application needs to restyle or replace parts.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as RichText from 'foldkit-richtext'

/** The editor state a toolbar reads: what a Bundle projects, without the rest. */
export interface ToolbarState {
  readonly document: RichText.Document
  readonly selection: RichText.Selection | null
  readonly storedMarks: ReadonlyArray<string> | null
}

export interface ToolbarOptions<Message> {
  readonly state: ToolbarState
  /** The marks to offer, by name. Defaults to the three the package ships. */
  readonly marks?: ReadonlyArray<string> | undefined
  /** How a mark becomes the application's Message, usually its editor wrapper. */
  readonly toMessage: (mark: string) => Message
}

/**
 * A mark is active when the caret carries it, or — with no stored format — when
 * every run the selection covers does (§119).
 */
const active = (state: ToolbarState, mark: string): boolean =>
  state.storedMarks !== null
    ? state.storedMarks.includes(mark)
    : RichText.marksInRange(state.document, state.selection).has(mark)

/** Buttons for the editor's marks. The application decides where they go. */
export const marksToolbar =
  <Message>(options: ToolbarOptions<Message>) =>
  (h: HtmlBuilder<Message>): Html => {
    const marks = options.marks ?? RichText.shippedMarks.map(definition => definition.name)
    return h.div(
      [h.DataAttribute('toolbar', 'marks')],
      marks.map(mark =>
        h.button(
          [
            h.Type('button'),
            h.DataAttribute('mark', mark),
            h.AriaLabel(mark),
            h.AriaPressed(active(options.state, mark) ? 'true' : 'false'),
            h.OnClick(options.toMessage(mark)),
          ],
          [mark],
        ),
      ),
    )
  }
