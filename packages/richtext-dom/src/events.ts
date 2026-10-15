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
} from './index.js'
import { parseHtml } from './html.js'

export interface Intent {
  /** The semantic command to run, when the event maps to one. */
  readonly command?: RichText.Command
  /** A history intent: undo or redo, which are editor intents, not commands. */
  readonly history?: 'undo' | 'redo'
  readonly preventDefault: boolean
}

/**
 * One chord an application adds to the adapter's table, or overrides in it.
 * Modifiers match exactly and the key matches what the browser reports, so
 * `Mod-b` does not fire for Shift held, and a chord that types a symbol names the
 * symbol: Shift+8 is `Mod-Shift-*` on a US layout, not `Mod-Shift-8`.
 */
export interface KeyBinding {
  /** `Mod-b`, `Mod-Shift-b`, `Alt-ArrowUp`. `Mod` is Meta or Control, either one. */
  readonly chord: string
  readonly command: RichText.Command
}

const chordMatches = (chord: string, event: KeyboardEvent): boolean => {
  const parts = chord.split('-')
  const name = parts[parts.length - 1] ?? ''
  const modifiers = parts.slice(0, -1)
  const wantsMod = modifiers.includes('Mod')
  const hasMod = event.metaKey || event.ctrlKey
  if (hasMod !== wantsMod) return false
  if (event.shiftKey !== modifiers.includes('Shift')) return false
  if (event.altKey !== modifiers.includes('Alt')) return false
  return name.length === 1 ? event.key.toLowerCase() === name.toLowerCase() : event.key === name
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
    // Without Shift, the browser's save.
    case 's':
      return event.shiftKey ? 'Strikethrough' : undefined
    default:
      return undefined
  }
}

/**
 * Reads one event as intent. `composing` tells the adapter that an IME owns the
 * interaction: the browser must keep its temporary text, so composition input
 * is passed through and committed on `compositionend` instead.
 *
 * `keymap` is checked before the built-in chords, so an application adds to the
 * table or overrides an entry without forking the adapter.
 */
export const intentFor = (
  event: Event,
  composing = false,
  keymap: ReadonlyArray<KeyBinding> = [],
): Intent | undefined => {
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
  const bound = keymap.find(binding => chordMatches(binding.chord, key))
  if (bound !== undefined) return { preventDefault: true, command: bound.command }
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

/**
 * The semantic selection the browser is currently showing, if it resolves: null when the
 * page's selection is outside the editor, which is not the editor's to read.
 */
/**
 * The atom a range holds whole, as a node selection is drawn: an atom has no text for a caret,
 * so the browser is given the range around its element.
 */
const selectedAtom = (dom: EditorDom, selection: Selection): RichText.NodeId | undefined => {
  const parent = selection.anchorNode
  if (parent === null || parent !== selection.focusNode) return undefined
  if (Math.abs(selection.focusOffset - selection.anchorOffset) !== 1) return undefined
  const child = parent.childNodes[Math.min(selection.anchorOffset, selection.focusOffset)]
  const id = child instanceof Element ? child.getAttribute('data-block') : null
  if (id === null) return undefined
  const block = RichText.locateBlock(dom.content, RichText.NodeId.make(id))?.block
  return block !== undefined && RichText.isAtom(undefined, block) ? block.id : undefined
}

export const readSelection = (dom: EditorDom): RichText.Selection | null => {
  const selection = dom.root.ownerDocument.defaultView?.getSelection()
  if (selection === null || selection === undefined || selection.rangeCount === 0) return null
  const selected = selectedAtom(dom, selection)
  if (selected !== undefined) return { type: 'Node', node: selected }
  const anchor = rangeToPosition(dom, selection.anchorNode ?? dom.root, selection.anchorOffset)
  const focus = rangeToPosition(dom, selection.focusNode ?? dom.root, selection.focusOffset)
  if (anchor === undefined || focus === undefined) return null
  return { type: 'Range', anchor, focus }
}

/**
 * Where a position is in the DOM: a text node and an offset into it, or, on an empty line, the
 * line's element and the index of its `<br>`, where a browser draws a caret.
 */
const endpointFor = (
  dom: EditorDom,
  position: RichText.Position,
): { node: Node; offset: number } | undefined => {
  const range = positionToRange(dom, position)
  return range === undefined ? undefined : { node: range.startContainer, offset: range.startOffset }
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
  if (selection === null) return
  if (selection.type === 'Node') {
    const element = dom.elements.get(selection.node)
    if (element === undefined || element.parentNode === null) return
    const range = dom.root.ownerDocument.createRange()
    range.selectNode(element)
    live.addRange(range)
    return
  }
  const anchor = endpointFor(dom, selection.anchor)
  const focus = endpointFor(dom, selection.focus)
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
  /**
   * Called when the caret or range moves to a position the application did not
   * just commit. Without it the editor never learns where the caret is; the
   * adapter cannot follow a selection it is not told about.
   */
  readonly onSelection?: (selection: RichText.Selection | null) => void
  /**
   * When given, imported HTML is constrained to this vocabulary: a node kind
   * the Kit does not declare is degraded to a paragraph, never kept.
   */
  readonly kit?: RichText.Kit | undefined
  /** Chords the application adds or overrides, checked before the built-ins. */
  readonly keymap?: ReadonlyArray<KeyBinding> | undefined
  /**
   * What is drawn over the document (§129), derived from it each time it is synced — code
   * highlighting, say. A pure read: it sees the document and nothing else.
   */
  readonly decorate?: Decorate | undefined
  /** What a blank document shows (`RichText.isBlank`): "Write something…". */
  readonly placeholder?: string | undefined
  /**
   * What the empty paragraph a collapsed caret is in shows, as `data-hint` on it, which a
   * stylesheet draws as it draws the placeholder (usually only while the editor has the focus).
   * A blank document's block shows the placeholder instead.
   */
  readonly lineHint?: string | undefined
  /**
   * The node vocabulary, which says where Tab means something (`RichText.takesTab`): code and
   * table cells take it as `Indent` and `Outdent`; anywhere else it moves focus as it always does.
   */
  readonly nodes?: RichText.NodeRegistry | undefined
  /** Called with a block and an adornment's `action` when that adornment is clicked. */
  readonly onAction?: ((node: RichText.NodeId, action: string) => void) | undefined
}

/** What is drawn over a document, derived from it on every render (§129). */
export type Decorate = (document: RichText.Document) => RichText.DecorationSet

/** A change set that names nothing: what a redraw of the same document patches with. */
const unchanged: RichText.ChangeSet = {
  dirtyNodes: new Set(),
  insertedNodes: new Set(),
  removedNodes: new Set(),
  textChanged: new Set(),
  structureChanged: false,
  selectionChanged: false,
}

export interface Attachment {
  /** The current subtree; replaced as patches are applied. */
  readonly current: () => EditorDom
  /**
   * Applies a committed state, patching and restoring the browser selection. While the
   * browser is composing, the latest state waits and is drawn when composition ends.
   */
  readonly sync: (state: RichText.EditorState, changeSet: RichText.ChangeSet) => void
  /**
   * Draws the decorations again over what is drawn, for when they changed and the document
   * did not, and puts the browser's selection back where it was. Nothing while composing:
   * the next state drawn brings them.
   */
  readonly redecorate: () => void
  /**
   * Takes the focus with the caret or range at `selection`, scrolled into view when it is out
   * of it: for a control outside the editor that sends the reader into the text, such as a table
   * of contents or a find bar closing on its match.
   */
  readonly focus: (selection: RichText.Selection) => void
  /**
   * The latest document synced: the one waiting on a composition, or else the one drawn. A
   * patch computed from here to the next state is what brings the subtree up to it.
   */
  readonly held: () => RichText.Document
  /** True between compositionstart and compositionend. */
  readonly composing: () => boolean
  readonly detach: () => void
}

const samePosition = (left: RichText.Position, right: RichText.Position): boolean =>
  left.node === right.node && left.offset === right.offset

const sameSelection = (
  left: RichText.Selection | null,
  right: RichText.Selection | null,
): boolean => {
  if (left === null || right === null) return left === right
  if (left.type === 'Node' || right.type === 'Node') {
    return left.type === 'Node' && right.type === 'Node' && left.node === right.node
  }
  return samePosition(left.anchor, right.anchor) && samePosition(left.focus, right.focus)
}

/**
 * Marks the lone block of a blank document with `data-placeholder`, which a stylesheet draws
 * with `::before { content: attr(data-placeholder) }`, and clears it from any block that no
 * longer qualifies. It is an attribute rather than a text node, so it never enters the
 * content the adapter reads back or the caret mapping. The block, not the root, carries it,
 * so the text sits on the line the caret is on.
 */
const drawPlaceholder = (
  dom: EditorDom,
  placeholder: string,
  marked: Element | undefined,
): Element | undefined => {
  dom.root.setAttribute('aria-placeholder', placeholder)
  const first = dom.content.children[0]
  const target =
    RichText.isBlank(dom.content) && first !== undefined ? dom.elements.get(first.id) : undefined
  // Only the element marked last can carry the attribute, so nothing is searched per patch.
  if (marked !== target) marked?.removeAttribute('data-placeholder')
  target?.setAttribute('data-placeholder', placeholder)
  return target
}

/** The empty paragraph a collapsed caret is in, in a document that is not blank. */
const emptyLineAt = (dom: EditorDom, selection: RichText.Selection | null): Element | undefined => {
  if (selection?.type !== 'Range' || !samePosition(selection.anchor, selection.focus)) {
    return undefined
  }
  if (RichText.isBlank(dom.content)) return undefined
  const run = RichText.locateRun(dom.content, selection.focus.node)
  const block = run === undefined ? undefined : RichText.blockAtPath(dom.content, run.path)
  return block?.type === 'Paragraph' && block.children.every(each => each.text === '')
    ? dom.elements.get(block.id)
    : undefined
}

/**
 * The caret in the nearest text before or after a block, as an arrow key leaves a selected
 * image: null when there is no text on that side.
 */
const caretBeside = (
  document: RichText.Document,
  node: RichText.NodeId,
  after: boolean,
): RichText.Selection | null => {
  let seen = false
  let before: RichText.Block['children'][number] | undefined
  let next: RichText.Block['children'][number] | undefined
  RichText.eachBlock(document.children, block => {
    if (block.id === node) seen = true
    else if (!seen) before = block.children.at(-1) ?? before
    else next ??= block.children[0]
  })
  const run = after ? next : before
  if (!seen || run === undefined) return null
  const at = { node: run.id, offset: after ? 0 : run.text.length, affinity: 'after' as const }
  return { type: 'Range', anchor: at, focus: at }
}

/** What a press inside an atom belongs to rather than the editor: a control, a link. */
const INTERACTIVE = 'a, button, input, select, textarea, video, audio'

/**
 * Wires the owned subtree to an application. The adapter never decides what an
 * edit means: it translates events into commands, hands them to `onIntent`, and
 * patches whatever the application commits.
 */
export const attach = (dom: EditorDom, options: AttachOptions): Attachment => {
  let current = dom
  // Every replacement of the subtree goes through here: a repair or a patch can render the
  // blank block fresh, without the attribute the last one carried.
  let marked: Element | undefined
  /**
   * The selection the application last committed, or the adapter last reported.
   * Restoring it fires `selectionchange`, so without this the adapter would
   * report the position it had just been told as if a person had moved there.
   * Affinity is ignored: it is derived from the range, not carried by it.
   */
  let lastSelection: RichText.Selection | null = null
  let hinted: Element | undefined
  let selectedBlock: Element | undefined
  /**
   * Marks the block a node selection holds with `data-selected`: the browser draws no
   * selection of its own for one, so this is the only sign of it.
   */
  const markSelected = (): void => {
    const target =
      lastSelection?.type === 'Node' ? current.elements.get(lastSelection.node) : undefined
    if (selectedBlock !== target) selectedBlock?.removeAttribute('data-selected')
    target?.setAttribute('data-selected', '')
    selectedBlock = target
  }
  /** Moves `data-hint` to the empty line the caret is on, or takes it away. */
  const hint = (): void => {
    if (options.lineHint === undefined) return
    const target = emptyLineAt(current, lastSelection)
    if (hinted !== target) hinted?.removeAttribute('data-hint')
    target?.setAttribute('data-hint', options.lineHint)
    hinted = target
  }
  const redraw = (next: EditorDom): void => {
    current = next
    if (options.placeholder !== undefined) {
      marked = drawPlaceholder(current, options.placeholder, marked)
    }
    hint()
    markSelected()
  }
  redraw(dom)
  let composing = false
  /**
   * Only a range that resolves inside the editor is news. A selection elsewhere on the page
   * (another editor, an input) leaves the editor's own where it was, and so does a live
   * selection that cannot show the Model's: the browser never holds a Node selection, so
   * reading its absence back would turn a selected block into no selection at all.
   */
  const reportSelection = (): void => {
    // While composing, the caret points into text the document does not have.
    if (composing) return
    const selection = readSelection(current)
    if (selection === null || sameSelection(selection, lastSelection)) return
    lastSelection = selection
    hint()
    markSelected()
    options.onSelection?.(selection)
  }
  /** Takes a selection the editor made itself, as a click on an image or an arrow key does. */
  const select = (selection: RichText.Selection): void => {
    restoreSelection(current, selection)
    if (sameSelection(selection, lastSelection)) return
    lastSelection = selection
    hint()
    markSelected()
    options.onSelection?.(selection)
  }
  /**
   * The browser's selection is the page's, not the editor's: the editor moves it only while
   * it is inside the editor, so a redraw never takes the caret from another editor or an input.
   * Read before a patch replaces the nodes it points into.
   */
  const ownsSelection = (): boolean => {
    const live = current.root.ownerDocument.defaultView?.getSelection()
    if (live === null || live === undefined || live.rangeCount === 0) return false
    return current.root.contains(live.anchorNode) && current.root.contains(live.focusNode)
  }
  let placeholderIds = 0
  /**
   * A state the application committed while the browser was composing: drawing it then
   * would rewrite the text under the IME, so it waits for the composition to end. Change
   * sets are unioned, which never under-invalidates.
   */
  let deferred: { state: RichText.EditorState; changeSet: RichText.ChangeSet } | undefined
  const draw = (state: RichText.EditorState, changeSet: RichText.ChangeSet): void => {
    const owned = ownsSelection()
    lastSelection = state.selection
    redraw(patchInto(current, state.document, changeSet, options.decorate?.(state.document)))
    if (owned) restoreSelection(current, state.selection)
  }
  const onEvent = (event: Event): void => {
    // From a selected atom, an arrow goes to the text beside it, where a browser would step
    // into the atom's own markup.
    if (event.type === 'keydown' && !composing && lastSelection?.type === 'Node') {
      const key = (event as KeyboardEvent).key
      const after = key === 'ArrowRight' || key === 'ArrowDown'
      if (after || key === 'ArrowLeft' || key === 'ArrowUp') {
        event.preventDefault()
        const beside = caretBeside(current.content, lastSelection.node, after)
        if (beside !== null) select(beside)
        return
      }
    }
    // Tab is taken only where it means something, so it still leaves the editor elsewhere.
    if (event.type === 'keydown' && !composing) {
      const key = event as KeyboardEvent
      if (key.key === 'Tab' && !key.altKey && !key.ctrlKey && !key.metaKey) {
        if (!RichText.takesTab(current.content, readSelection(current), options.nodes)) return
        event.preventDefault()
        reportSelection()
        options.onIntent({ type: key.shiftKey ? 'Outdent' : 'Indent' })
        return
      }
    }
    const intent = intentFor(event, composing, options.keymap)
    if (intent === undefined) return
    if (intent.preventDefault) event.preventDefault()
    // `selectionchange` is asynchronous, so a click just before a keystroke may not have
    // been reported yet: report it first, or the edit lands at the caret before the click.
    if (intent.command !== undefined) {
      reportSelection()
      options.onIntent(intent.command)
    }
    if (intent.history !== undefined) options.onHistory?.(intent.history)
  }
  const onCompositionStart = (): void => {
    reportSelection()
    composing = true
  }
  const onCompositionEnd = (event: Event): void => {
    composing = false
    const data = (event as Event & { readonly data?: string | null }).data
    // The browser's temporary text is not in the document, whether the IME
    // committed or cancelled, so repair the subtree before anything else, then
    // put back the selection composition started from — not the caret the
    // browser moved into its own temporary text. Nothing is reported or synced
    // while composing, so that is still `lastSelection`; with none known (an end
    // without a start), the caret is left where the browser put it.
    redraw(repair(current, current.content))
    // What arrived during the composition is drawn now. Its selection is the
    // application's, which holds the caret composition started from.
    if (deferred !== undefined) draw(deferred.state, deferred.changeSet)
    else if (lastSelection !== null) restoreSelection(current, lastSelection)
    deferred = undefined
    if (data != null && data.length > 0) options.onIntent({ type: 'InsertText', text: data })
  }
  const writeClipboard = (clipboard: ClipboardLike, slice: RichText.Slice): void => {
    clipboard.setData(SLICE_CLIPBOARD_TYPE, RichText.serializeSlice(slice))
    // HTML for other applications; importing it back waits on a
    // kit-constrained parser, so paste still prefers the slice.
    clipboard.setData('text/html', RichText.toHtml(slice.blocks))
    clipboard.setData('text/plain', RichText.toText(slice.blocks))
  }
  const onCopy = (event: Event): void => {
    const clipboard = (event as Event & { readonly clipboardData?: ClipboardLike }).clipboardData
    const slice = RichText.sliceOf(current.content, readSelection(current))
    if (clipboard === undefined || slice === undefined) return
    event.preventDefault()
    writeClipboard(clipboard, slice)
  }
  const onCut = (event: Event): void => {
    // The delete below runs at the application's selection, which a click just before may
    // not have reached yet, as with a keystroke.
    reportSelection()
    const clipboard = (event as Event & { readonly clipboardData?: ClipboardLike }).clipboardData
    const selection = readSelection(current)
    const slice = RichText.sliceOf(current.content, selection)
    if (clipboard === undefined || slice === undefined) return
    event.preventDefault()
    writeClipboard(clipboard, slice)
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
    const html = clipboard.getData('text/html')
    const text = clipboard.getData('text/plain')
    const placeholders = () => `clipboard-${++placeholderIds}`
    // Slice first, then HTML, then plain text (§69). A payload this version
    // cannot read falls through rather than pasting nothing, and the Paste
    // command remints every identity, so these placeholders never reach the
    // document.
    const slice =
      (payload.length > 0 ? RichText.deserializeSlice(payload) : undefined) ??
      (html.length > 0
        ? {
            version: 1 as const,
            blocks: parseHtml(html, { kit: options.kit, mint: placeholders }).blocks,
          }
        : undefined) ??
      (text.length > 0 ? RichText.sliceFromText(text, placeholders) : undefined)
    if (slice === undefined || slice.blocks.length === 0) return
    event.preventDefault()
    reportSelection()
    options.onIntent({ type: 'Paste', slice })
  }
  // A click on an adornment that toggles a prop (a task's checkbox, a toggle's arrow) flips it in
  // the document; the browser's own change to a checkbox is refused, since the patch that
  // follows draws what the document says.
  const onClick = (event: MouseEvent): void => {
    const origin = event.target
    if (!(origin instanceof Element)) return
    const acting = origin.closest(`[${RichText.ACTION_ATTRIBUTE}]`)
    const actedOn = acting?.closest('[data-block]')?.getAttribute('data-block')
    if (
      acting !== null &&
      actedOn !== null &&
      actedOn !== undefined &&
      current.root.contains(acting)
    ) {
      event.preventDefault()
      options.onAction?.(
        RichText.NodeId.make(actedOn),
        acting.getAttribute(RichText.ACTION_ATTRIBUTE)!,
      )
      return
    }
    const adornment = origin.closest(`[${RichText.TOGGLES_ATTRIBUTE}]`)
    if (adornment === null || !current.root.contains(adornment)) return
    const prop = adornment.getAttribute(RichText.TOGGLES_ATTRIBUTE)!
    const id = adornment.closest('[data-block]')?.getAttribute('data-block')
    const block =
      id === null || id === undefined
        ? undefined
        : RichText.locateBlock(current.content, RichText.NodeId.make(id))?.block
    if (block?.type !== 'Node') return
    event.preventDefault()
    options.onIntent({
      type: 'SetProps',
      node: block.id,
      props: { [prop]: block.props[prop] !== true },
    })
  }
  // A press on an atom (an image, a divider) selects it whole, as there is no text in it for
  // a caret, and keeps the browser from dragging it or putting the caret elsewhere.
  const onMouseDown = (event: MouseEvent): void => {
    const origin = event.target
    if (event.button !== 0 || !(origin instanceof Element)) return
    if (origin.closest(INTERACTIVE) !== null) return
    if (
      origin.closest(`[${RichText.ACTION_ATTRIBUTE}], [${RichText.TOGGLES_ATTRIBUTE}]`) !== null
    ) {
      return
    }
    const id = origin.closest('[data-block]')?.getAttribute('data-block')
    if (id === null || id === undefined || !current.root.contains(origin)) return
    const block = RichText.locateBlock(current.content, RichText.NodeId.make(id))?.block
    if (block === undefined || !RichText.isAtom(options.nodes, block)) return
    event.preventDefault()
    current.root.focus({ preventScroll: true })
    select({ type: 'Node', node: block.id })
  }
  const target = dom.root
  // The caret belongs to the document, not the subtree: a click elsewhere on the
  // page, or an arrow key, moves it without an event the root would see.
  const ownerDocument = target.ownerDocument
  ownerDocument.addEventListener('selectionchange', reportSelection)
  target.addEventListener('beforeinput', onEvent)
  target.addEventListener('keydown', onEvent)
  target.addEventListener('compositionstart', onCompositionStart)
  target.addEventListener('compositionend', onCompositionEnd)
  target.addEventListener('copy', onCopy)
  target.addEventListener('cut', onCut)
  target.addEventListener('paste', onPaste)
  target.addEventListener('click', onClick)
  target.addEventListener('mousedown', onMouseDown)
  return {
    current: () => current,
    held: () => deferred?.state.document ?? current.content,
    composing: () => composing,
    redecorate: () => {
      if (composing) return
      const selection = readSelection(current)
      redraw(patchInto(current, current.content, unchanged, options.decorate?.(current.content)))
      if (selection !== null) restoreSelection(current, selection)
    },
    focus: selection => {
      current.root.focus({ preventScroll: true })
      restoreSelection(current, selection)
      if (selection.type !== 'Range') return
      const at = positionToRange(current, selection.focus)?.startContainer
      const element = at instanceof Element ? at : at?.parentElement
      const box = element?.getBoundingClientRect()
      const view = current.root.ownerDocument.defaultView
      if (box === undefined || view === null) return
      if (box.top < 0 || box.bottom > view.innerHeight) element?.scrollIntoView({ block: 'center' })
    },
    sync: (state, changeSet) => {
      if (!composing) return draw(state, changeSet)
      deferred = {
        state,
        changeSet:
          deferred === undefined
            ? changeSet
            : RichText.unionChangeSet(deferred.changeSet, changeSet),
      }
    },
    detach: () => {
      ownerDocument.removeEventListener('selectionchange', reportSelection)
      target.removeEventListener('beforeinput', onEvent)
      target.removeEventListener('keydown', onEvent)
      target.removeEventListener('compositionstart', onCompositionStart)
      target.removeEventListener('compositionend', onCompositionEnd)
      target.removeEventListener('copy', onCopy)
      target.removeEventListener('cut', onCut)
      target.removeEventListener('paste', onPaste)
      target.removeEventListener('click', onClick)
      target.removeEventListener('mousedown', onMouseDown)
    },
  }
}
