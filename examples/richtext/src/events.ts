/**
 * Browser events as editor intent (§§30–31). The adapter owns the subtree, so
 * every event it understands is `preventDefault`ed: the browser must not mutate
 * the DOM behind the semantic document. An event the adapter does not
 * understand is left alone (the caller lets it through), and one it understands
 * but cannot yet honor is prevented without a command — a deliberate no-op
 * rather than a silent DOM divergence.
 */
import type * as RichText from 'foldkit-richtext'
import { patch as patchInto, positionToRange, rangeToPosition, type EditorDom } from './dom.js'

export interface Intent {
  /** The semantic command to run, when the event maps to one. */
  readonly command?: RichText.Command
  /** A history intent: undo or redo, which are editor intents, not commands. */
  readonly history?: 'undo' | 'redo'
  readonly preventDefault: boolean
}

const MOD = (event: KeyboardEvent): boolean => event.metaKey || event.ctrlKey

const historyChord = (event: KeyboardEvent): 'undo' | 'redo' | undefined => {
  if (!MOD(event)) return undefined
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y') return 'redo'
  return undefined
}

const markChord = (event: KeyboardEvent): string | undefined => {
  if (!MOD(event)) return undefined
  switch (event.key.toLowerCase()) {
    case 'b':
      return 'Bold'
    case 'i':
      return 'Italic'
    case 'e':
      return 'Code'
    default:
      return undefined
  }
}

/**
 * Reads one event as intent. `composing` tells the adapter that an IME owns the
 * interaction: the browser must keep its temporary text, so composition input
 * is passed through and committed on `compositionend` instead.
 */
export const intentFor = (event: Event, composing = false): Intent | undefined => {
  if (event.type === 'beforeinput') {
    const input = event as Event & { readonly inputType?: string; readonly data?: string | null }
    const inputType = input.inputType ?? ''
    if (composing || inputType === 'insertCompositionText') return { preventDefault: false }
    switch (inputType) {
      case 'insertText':
        return input.data == null || input.data.length === 0
          ? { preventDefault: true }
          : { preventDefault: true, command: { type: 'InsertText', text: input.data } }
      case 'insertParagraph':
      case 'insertLineBreak':
        return { preventDefault: true, command: { type: 'SplitBlock' } }
      case 'deleteContentBackward':
        return { preventDefault: true, command: { type: 'DeleteBackward' } }
      case 'deleteContentForward':
        return { preventDefault: true, command: { type: 'DeleteForward' } }
      case 'formatBold':
        return { preventDefault: true, command: { type: 'ToggleMark', mark: 'Bold' } }
      case 'formatItalic':
        return { preventDefault: true, command: { type: 'ToggleMark', mark: 'Italic' } }
      default:
        // Paste, word deletion, autocorrect, and anything else the browser
        // invents: prevented so the DOM cannot drift, until it is implemented.
        return inputType.length === 0 ? undefined : { preventDefault: true }
    }
  }
  if (event.type !== 'keydown') return undefined
  const key = event as KeyboardEvent
  if (composing) return { preventDefault: false }
  const history = historyChord(key)
  if (history !== undefined) return { preventDefault: true, history }
  const mark = markChord(key)
  if (mark !== undefined) return { preventDefault: true, command: { type: 'ToggleMark', mark } }
  switch (key.key) {
    case 'Enter':
      return { preventDefault: true, command: { type: 'SplitBlock' } }
    case 'Backspace':
      return { preventDefault: true, command: { type: 'DeleteBackward' } }
    case 'Delete':
      return { preventDefault: true, command: { type: 'DeleteForward' } }
    default:
      return undefined
  }
}

/** The semantic selection the browser is currently showing, if it resolves. */
export const readSelection = (dom: EditorDom): RichText.Selection | null => {
  const selection = dom.root.ownerDocument.defaultView?.getSelection()
  if (selection === null || selection === undefined || selection.rangeCount === 0) return null
  const anchor = rangeToPosition(dom, selection.anchorNode ?? dom.root, selection.anchorOffset)
  const focus = rangeToPosition(dom, selection.focusNode ?? dom.root, selection.focusOffset)
  if (anchor === undefined || focus === undefined) return null
  return { type: 'Range', anchor, focus }
}

const textFor = (
  dom: EditorDom,
  position: RichText.Position,
): { node: Text; offset: number } | undefined => {
  const range = positionToRange(dom, position)
  const container = range?.startContainer
  return container instanceof Text ? { node: container, offset: range!.startOffset } : undefined
}

/**
 * Puts the browser selection back where the semantic state says it is. Direction
 * is preserved through `setBaseAndExtent` when the environment has it; jsdom and
 * some engines only offer a range, which cannot express direction.
 */
export const restoreSelection = (dom: EditorDom, selection: RichText.Selection | null): void => {
  const window = dom.root.ownerDocument.defaultView
  const live = window?.getSelection()
  if (window === null || window === undefined || live === null || live === undefined) return
  live.removeAllRanges()
  if (selection === null || selection.type === 'Node') return
  const anchor = textFor(dom, selection.anchor)
  const focus = textFor(dom, selection.focus)
  if (anchor === undefined || focus === undefined) return
  if (typeof live.setBaseAndExtent === 'function') {
    live.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
    return
  }
  const range = dom.root.ownerDocument.createRange()
  range.setStart(anchor.node, anchor.offset)
  range.setEnd(focus.node, focus.offset)
  live.addRange(range)
}

export interface AttachOptions {
  /** Called with each semantic command the browser produced. */
  readonly onIntent: (command: RichText.Command) => void
  /** Called for undo and redo, which are editor intents rather than commands. */
  readonly onHistory?: (direction: 'undo' | 'redo') => void
}

export interface Attachment {
  /** The current subtree; replaced as patches are applied. */
  readonly current: () => EditorDom
  /** Applies a committed state, patching and restoring the browser selection. */
  readonly sync: (state: RichText.EditorState, changeSet: RichText.ChangeSet) => void
  /** True between compositionstart and compositionend. */
  readonly composing: () => boolean
  readonly detach: () => void
}

/**
 * Wires the owned subtree to an application. The adapter never decides what an
 * edit means: it translates events into commands, hands them to `onIntent`, and
 * patches whatever the application commits.
 */
export const attach = (dom: EditorDom, options: AttachOptions): Attachment => {
  let current = dom
  let composing = false
  const onEvent = (event: Event): void => {
    const intent = intentFor(event, composing)
    if (intent === undefined) return
    if (intent.preventDefault) event.preventDefault()
    if (intent.command !== undefined) options.onIntent(intent.command)
    if (intent.history !== undefined) options.onHistory?.(intent.history)
  }
  const onCompositionStart = (): void => {
    composing = true
  }
  const onCompositionEnd = (event: Event): void => {
    composing = false
    const data = (event as Event & { readonly data?: string | null }).data
    // The composed text becomes one ordinary edit at the semantic caret.
    if (data != null && data.length > 0) options.onIntent({ type: 'InsertText', text: data })
  }
  const target = dom.root
  target.addEventListener('beforeinput', onEvent)
  target.addEventListener('keydown', onEvent)
  target.addEventListener('compositionstart', onCompositionStart)
  target.addEventListener('compositionend', onCompositionEnd)
  return {
    current: () => current,
    composing: () => composing,
    sync: (state, changeSet) => {
      current = patchInto(current, state.document, changeSet)
      restoreSelection(current, state.selection)
    },
    detach: () => {
      target.removeEventListener('beforeinput', onEvent)
      target.removeEventListener('keydown', onEvent)
      target.removeEventListener('compositionstart', onCompositionStart)
      target.removeEventListener('compositionend', onCompositionEnd)
    },
  }
}
