/**
 * Browser events as editor intent (§§30–31). The adapter owns the subtree, so
 * every event it understands is `preventDefault`ed: the browser must not mutate
 * the DOM behind the semantic document. An event the adapter does not
 * understand is left alone (the caller lets it through), and one it understands
 * but cannot yet honor is prevented without a command — a deliberate no-op
 * rather than a silent DOM divergence.
 */
import * as RichText from 'foldkit-richtext'
import {
  patch as patchInto,
  positionToRange,
  rangeToPosition,
  repair,
  type EditorDom,
} from './dom.js'

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

/** The clipboard type a Foldkit RichText slice travels under. */
export const SLICE_CLIPBOARD_TYPE = 'application/x-foldkit-richtext+json'

interface ClipboardLike {
  getData: (type: string) => string
  setData: (type: string, value: string) => void
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
  let placeholderIds = 0
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
    // The browser's temporary text is not in the document, whether the IME
    // committed or cancelled, so repair the subtree before anything else. The
    // repair re-renders blocks and detaches the live selection, so capture the
    // semantic selection first and put it back after.
    const semantic = readSelection(current)
    current = repair(current, current.content)
    restoreSelection(current, semantic)
    if (data != null && data.length > 0) options.onIntent({ type: 'InsertText', text: data })
  }
  const onCopy = (event: Event): void => {
    const clipboard = (event as Event & { readonly clipboardData?: ClipboardLike }).clipboardData
    const slice = RichText.sliceOf(current.content, readSelection(current))
    if (clipboard === undefined || slice === undefined) return
    event.preventDefault()
    clipboard.setData(SLICE_CLIPBOARD_TYPE, RichText.serializeSlice(slice))
    clipboard.setData('text/plain', RichText.plainTextOf(slice))
  }
  const onCut = (event: Event): void => {
    const clipboard = (event as Event & { readonly clipboardData?: ClipboardLike }).clipboardData
    const selection = readSelection(current)
    const slice = RichText.sliceOf(current.content, selection)
    if (clipboard === undefined || slice === undefined) return
    event.preventDefault()
    clipboard.setData(SLICE_CLIPBOARD_TYPE, RichText.serializeSlice(slice))
    clipboard.setData('text/plain', RichText.plainTextOf(slice))
    // A collapsed caret cuts nothing; a range is removed through the same
    // delete intent a Backspace would produce.
    const collapsed =
      selection?.type === 'Range' &&
      selection.anchor.node === selection.focus.node &&
      selection.anchor.offset === selection.focus.offset
    if (!collapsed) options.onIntent({ type: 'DeleteBackward' })
  }
  const onPaste = (event: Event): void => {
    const clipboard = (event as Event & { readonly clipboardData?: ClipboardLike }).clipboardData
    if (clipboard === undefined) return
    const payload = clipboard.getData(SLICE_CLIPBOARD_TYPE)
    const text = clipboard.getData('text/plain')
    // Slice first, then plain text: a payload this version cannot read falls
    // back rather than pasting nothing. An empty clipboard pastes nothing at
    // all, so the browser's default is left alone.
    const slice =
      (payload.length > 0 ? RichText.deserializeSlice(payload) : undefined) ??
      (text.length > 0
        ? RichText.sliceFromText(text, () => `clipboard-${++placeholderIds}`)
        : undefined)
    if (slice === undefined || slice.blocks.length === 0) return
    event.preventDefault()
    // The placeholder identities above are discarded: the Paste command remints
    // every identity it inserts.
    options.onIntent({ type: 'Paste', slice })
  }
  const target = dom.root
  target.addEventListener('beforeinput', onEvent)
  target.addEventListener('keydown', onEvent)
  target.addEventListener('compositionstart', onCompositionStart)
  target.addEventListener('compositionend', onCompositionEnd)
  target.addEventListener('copy', onCopy)
  target.addEventListener('cut', onCut)
  target.addEventListener('paste', onPaste)
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
      target.removeEventListener('copy', onCopy)
      target.removeEventListener('cut', onCut)
      target.removeEventListener('paste', onPaste)
    },
  }
}
