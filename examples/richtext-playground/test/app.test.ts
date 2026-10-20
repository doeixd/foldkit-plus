/**
 * The playground's transitions, driven through `update` as the page drives them: discussions
 * anchored by a mark the document carries, inserts placed at the top level, and the handle's
 * block commands. The patch Commands the editor returns are not run; there is no DOM here.
 */
import { Option, Schema } from 'effect'
import { ImageAsset } from 'foldkit-media'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import { ClipboardMessage } from 'foldkit-primitives/dom'
import { parse } from 'foldkit-richtext-markdown'
import {
  codeBlockAt,
  exported,
  Menu,
  Message,
  init,
  openMenu,
  openThreads,
  quoteOf,
  threadAt,
  topLevelPlace,
  update,
  type Model,
} from '../src/app.js'
import { discussedPhrase, firstThread } from '../src/document.js'
import { Blocks, RETURN_TO_REFERENCE } from '../src/vocabulary.js'

const step = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model)
const edited = (message: EditorMessage) => Message.GotEditor({ message })

const start = () => init().model
const top = (model: Model) => model.document.children
const kinds = (model: Model) =>
  top(model).map(block => (block.type === 'Node' ? block.kind : block.type))

const textOf = (block: RichText.Block): string => {
  const parts: Array<string> = []
  RichText.eachBlock([block], inner => parts.push(...inner.children.map(run => run.text)))
  return parts.join('')
}
const caret = (run: RichText.Text, offset = 0): RichText.Selection => ({
  type: 'Range',
  anchor: { node: run.id, offset, affinity: 'after' },
  focus: { node: run.id, offset, affinity: 'after' },
})
const over = (run: RichText.Text, from: number, to: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: run.id, offset: from, affinity: 'after' },
  focus: { node: run.id, offset: to, affinity: 'before' },
})
/** The first run of the top-level block at `index`. */
const runAt = (model: Model, index: number): RichText.Text => {
  let found: RichText.Text | undefined
  RichText.eachBlock([top(model)[index]!], block => {
    found ??= block.children[0]
  })
  return found!
}
const select = (model: Model, selection: RichText.Selection) =>
  step(model, edited(EditorMessage.Selected({ selection })))

describe('discussions', () => {
  it('open with the seeded one, anchored to its phrase', () => {
    const model = start()
    expect(openThreads(model).map(thread => thread.id)).toEqual([firstThread])
    expect(quoteOf(model.document, firstThread)).toBe(discussedPhrase)
  })

  it('start on selected text, marking it and adding the thread in one step', () => {
    const initial = start()
    const model = step(
      select(initial, over(runAt(initial, 0), 2, 8)),
      Message.StartedComment(),
      Message.Drafted({ text: 'Is little the right word?' }),
      Message.Commented(),
    )
    expect(quoteOf(model.document, 'thread-2')).toBe('little')
    expect(model.threads.find(thread => thread.id === 'thread-2')?.remarks).toEqual([
      { author: 'Alex Morgan', body: 'Is little the right word?' },
    ])
    expect(model.composing).toBe(false)
    expect(model.draft).toBe('')
    // One undo takes the mark away, and the thread with it from what is shown.
    const undone = step(model, edited(EditorMessage.Undone()))
    expect(openThreads(undone).map(thread => thread.id)).toEqual([firstThread])
  })

  it('do not start without selected text, or with nothing said', () => {
    const initial = start()
    const atCaret = step(select(initial, caret(runAt(initial, 0), 2)), Message.StartedComment())
    expect(atCaret.composing).toBe(false)
    const silent = step(
      select(initial, over(runAt(initial, 0), 2, 8)),
      Message.StartedComment(),
      Message.Drafted({ text: '   ' }),
      Message.Commented(),
    )
    expect(silent.threads).toHaveLength(1)
  })

  it('are open where the caret is, and a card puts it there', () => {
    const model = step(start(), Message.OpenedThread({ thread: firstThread }))
    expect(threadAt(model)).toBe(firstThread)
    const replied = step(
      model,
      Message.Drafted({ text: 'Agreed.' }),
      Message.Replied({ thread: firstThread }),
    )
    expect(replied.threads[0]?.remarks.map(remark => remark.body)).toEqual([
      'I love this direction. Could we add one concrete next step before sharing it?',
      'Agreed.',
    ])
  })

  it('resolve one at a time, leaving one started inside another', () => {
    const initial = start()
    const commented = top(initial)[1]!.children.find(entry => entry.text === discussedPhrase)!
    const inner = step(
      select(initial, over(commented, 5, 14)),
      Message.StartedComment(),
      Message.Drafted({ text: 'Which thing?' }),
      Message.Commented(),
    )
    expect(openThreads(inner).map(thread => thread.id)).toEqual([firstThread, 'thread-2'])
    const resolved = step(inner, Message.Resolved({ thread: firstThread }))
    expect(openThreads(resolved).map(thread => thread.id)).toEqual(['thread-2'])
    expect(quoteOf(resolved.document, 'thread-2')).toBe('something')
  })

  it('resolve by taking the highlight away, which undo brings back', () => {
    const resolved = step(start(), Message.Resolved({ thread: firstThread }))
    expect(openThreads(resolved)).toEqual([])
    expect(quoteOf(resolved.document, firstThread)).toBe('')
    const back = step(resolved, edited(EditorMessage.Undone()))
    expect(quoteOf(back.document, firstThread)).toBe(discussedPhrase)
    expect(openThreads(back).map(thread => thread.id)).toEqual([firstThread])
  })
})

describe('inserting from the toolbar', () => {
  it('goes after the caret’s top-level block, never inside a table cell', () => {
    const model = start()
    const tableIndex = kinds(model).indexOf('Table')
    const inCell = select(model, caret(runAt(model, tableIndex)))
    const inserted = step(inCell, Message.Inserted({ block: Blocks.divider() }))
    expect(kinds(inserted)[tableIndex + 1]).toBe('ThematicBreak')
  })

  it('goes before a blank line, which stays to type on', () => {
    const initial = start()
    const blank = step(
      select(initial, caret(runAt(initial, top(initial).length - 1), 27)),
      edited(EditorMessage.Entered()),
    )
    const before = kinds(blank)
    const inserted = step(blank, Message.Inserted({ block: Blocks.callout() }))
    expect(kinds(inserted)).toEqual([...before.slice(0, -1), 'Callout', 'Paragraph'])
  })

  it('goes at the end with no caret', () => {
    const initial = start()
    expect(topLevelPlace(initial)).toEqual({ after: top(initial).at(-1)!.id })
    const asset = Schema.decodeUnknownSync(ImageAsset)({
      key: 'a.png',
      width: 1200,
      height: 600,
      alpha: false,
      hash: null,
      placeholder: { _tag: 'Color', value: '#123456' },
    })
    const added = step(
      initial,
      Message.ImageRead({ src: 'https://example.com/a.png', alt: 'a', width: 300, asset }),
    )
    // The facts go in as the document stores them, and hold the image's box when it is drawn.
    expect(top(added).at(-1)).toMatchObject({
      kind: 'Image',
      props: {
        src: 'https://example.com/a.png',
        alt: 'a',
        width: 300,
        asset: { width: 1200, height: 600, hash: null },
      },
    })
  })

  it('puts any other file in as its type says', () => {
    const added = step(
      start(),
      Message.FileRead({
        src: 'data:video/mp4;base64,AA',
        name: 'clip.mp4',
        type: 'video/mp4',
        size: 2,
      }),
      Message.FileRead({
        src: 'data:text/csv;base64,AA',
        name: 'a.csv',
        type: 'text/csv',
        size: 2,
      }),
    )
    expect(kinds(added).slice(-2)).toEqual(['Video', 'Attachment'])
    expect(top(added).at(-2)).toMatchObject({ props: { title: 'clip' } })
  })
})

describe('a block handle', () => {
  const paragraphIndex = (model: Model) => kinds(model).indexOf('Paragraph')

  it('duplicates its block beside it, under new identities', () => {
    const model = start()
    const index = paragraphIndex(model)
    const node = top(model)[index]!.id
    const after = step(
      model,
      Message.OpenedMenu({ menu: Menu.Block({ node }) }),
      Message.DuplicatedBlock({ node }),
    )
    expect(textOf(top(after)[index + 1]!)).toBe(textOf(top(model)[index]!))
    expect(top(after)[index + 1]!.id).not.toBe(node)
    expect(Option.isNone(after.menu)).toBe(true)
  })

  it('turns its block into a heading, wherever the caret was', () => {
    const model = start()
    const node = top(model)[paragraphIndex(model)]!.id
    const after = step(model, Message.RetypedBlock({ node, block: { type: 'Heading', level: 2 } }))
    expect(top(after)[paragraphIndex(model)]).toMatchObject({ type: 'Heading', level: 2, id: node })
  })

  it('saves an image’s caption as typed', () => {
    const model = start()
    const image = top(model)[kinds(model).indexOf('Image')]!.id
    const after = step(
      model,
      Message.OpenedMenu({ menu: Menu.Caption({ node: image }) }),
      Message.CaptionDrafted({ caption: '  Dawn  ' }),
      Message.CaptionSaved({ node: image }),
    )
    expect(top(after)[kinds(model).indexOf('Image')]).toMatchObject({ props: { caption: 'Dawn' } })
  })
})

describe('Enter', () => {
  const textIn = (block: RichText.Block) => textOf(block)

  it('in a closed toggle’s title opens it, so the new line shows', () => {
    const initial = start()
    const index = kinds(initial).indexOf('Toggle')
    const title = runAt(initial, index)
    const after = step(
      select(initial, caret(title, title.text.length)),
      edited(EditorMessage.Entered()),
    )
    const toggle = top(after)[index]!
    expect(toggle).toMatchObject({ kind: 'Toggle', props: { open: true } })
    expect(toggle.type === 'Node' ? toggle.blocks?.length : 0).toBe(3)
  })

  it('in code breaks the line instead of making a second code block', () => {
    const initial = start()
    const index = kinds(initial).indexOf('CodeBlock')
    const code = runAt(initial, index)
    const after = step(select(initial, caret(code, 5)), edited(EditorMessage.Entered()))
    expect(kinds(after)).toEqual(kinds(initial))
    expect(textIn(top(after)[index]!)).toBe(`${code.text.slice(0, 5)}\n${code.text.slice(5)}`)
  })
})

describe('a code block', () => {
  it('has its toolbar while the caret is in it, and not elsewhere', () => {
    const initial = start()
    const index = kinds(initial).indexOf('CodeBlock')
    const inCode = select(initial, caret(runAt(initial, index), 3))
    expect(codeBlockAt(inCode)).toEqual(Option.some(top(initial)[index]!.id))
    expect(codeBlockAt(select(initial, caret(runAt(initial, 0), 1)))).toEqual(Option.none())
  })

  it('copies its text through the clipboard Command, and says what happened', () => {
    const initial = start()
    const code = top(initial)[kinds(initial).indexOf('CodeBlock')]!
    const copied = update(initial, Message.CopiedCode({ node: code.id }))
    expect(copied.model).toBe(initial)
    expect(copied.commands?.map(command => command.args)).toEqual([{ text: textOf(code) }])
    const said = step(
      initial,
      Message.GotClipboard({ message: ClipboardMessage.Copied(), what: 'the code' }),
    )
    expect(said.status).toEqual(Option.some({ text: 'Copied the code.', failed: false }))
  })
})

describe('find and replace', () => {
  const overlays = (result: { readonly commands?: ReadonlyArray<{ readonly name: string }> }) =>
    (result.commands ?? []).filter(command => command.name === 'RichText.overlay').length
  const find = (model: Model) => Option.getOrUndefined(model.find)
  const opened = (query: string) =>
    step(start(), Message.OpenedFind(), Message.FindQueried({ query }))

  it('opens on the selected text, and again with only a caret keeps its query', () => {
    const initial = start()
    const run = runAt(initial, 0)
    const chosen = step(select(initial, over(run, 0, 4)), Message.OpenedFind())
    expect(find(chosen)?.query).toBe(run.text.slice(0, 4))
    const again = step(
      chosen,
      Message.FindQueried({ query: 'the' }),
      edited(EditorMessage.Selected({ selection: caret(run) })),
      Message.OpenedFind(),
    )
    expect(find(again)?.query).toBe('the')
    expect(find(step(again, Message.ClosedFind(), Message.OpenedFind()))?.query).toBe('')
  })

  it('goes to a match by selecting it, and keeps the current one among the matches', () => {
    const model = opened('the')
    const matches = RichText.findMatches(model.document, 'the')
    expect(matches.length).toBeGreaterThan(2)
    const second = step(model, Message.SteppedMatch({ step: 1 }))
    expect(find(second)?.current).toBe(1)
    expect(second.editor.selection).toEqual({
      type: 'Range',
      anchor: matches[1]!.from,
      focus: matches[1]!.to,
    })
    // Replacing them all leaves none, so the current one is the first again.
    const replaced = step(
      // Back past the first match to the last.
      step(second, Message.SteppedMatch({ step: -1 }), Message.SteppedMatch({ step: -1 })),
      edited(EditorMessage.ReplacedText({ query: 'the', replacement: 'a' })),
    )
    expect(RichText.findMatches(replaced.document, 'the')).toEqual([])
    expect(find(replaced)?.current).toBe(0)
  })

  it('draws the matches again when the document or the bar changes, and clears them on close', () => {
    const model = opened('the')
    expect(overlays(update(model, Message.FindQueried({ query: 'a' })))).toBe(1)
    expect(overlays(update(model, edited(EditorMessage.Typed({ text: 'x' }))))).toBe(0)
    const typing = select(model, caret(runAt(model, 0)))
    expect(overlays(update(typing, edited(EditorMessage.Typed({ text: 'x' }))))).toBe(1)
    expect(overlays(update(model, Message.ClosedFind()))).toBe(1)
    const closed = step(typing, Message.ClosedFind())
    expect(overlays(update(closed, edited(EditorMessage.Typed({ text: 'x' }))))).toBe(0)
  })
})

describe('export', () => {
  it('reads back as the document: JSON exactly, Markdown with what it can hold', () => {
    const document = start().document
    const json = exported(document, 'JSON')
    expect(RichText.decodeDocument(JSON.parse(json.text))).toEqual(document)
    const markdown = exported(document, 'Markdown')
    const headings = (doc: RichText.Document) => RichText.outlineOf(doc).map(entry => entry.text)
    let n = 0
    const back = parse(markdown.text, { mint: () => `m${n++}` }).document
    expect(headings(back)).toEqual(headings(document))
    // The seeded callout has no Markdown syntax, and the footer says so.
    expect(markdown.what).toMatch(/without \d+ parts? it has no syntax for/)
    const html = exported(document, 'HTML')
    for (const text of headings(document)) expect(html.text).toContain(`>${text}</h`)
  })

  it('copies through the clipboard Command, closing the menu', () => {
    const model = step(start(), Message.OpenedMenu({ menu: Menu.Export() }))
    const result = update(model, Message.Exported({ format: 'JSON' }))
    expect(openMenu(result.model).export).toBe(false)
    expect(result.commands?.map(command => command.args)).toEqual([
      { text: exported(model.document, 'JSON').text },
    ])
    const said = step(
      result.model,
      Message.GotClipboard({ message: ClipboardMessage.Copied(), what: 'the document as JSON' }),
    )
    expect(said.status).toEqual(
      Option.some({ text: 'Copied the document as JSON.', failed: false }),
    )
  })
})

describe('a status', () => {
  it('says plainly that a copy failed, without the browser’s own words', () => {
    const failed = step(
      start(),
      Message.GotClipboard({
        message: ClipboardMessage.CopyFailed({ message: 'NotAllowedError: denied' }),
        what: 'the code',
      }),
    )
    expect(failed.status).toEqual(
      Option.some({
        text: 'Could not copy the code: this browser did not allow it.',
        failed: true,
      }),
    )
  })

  it('goes by itself, unless a newer one took its place', () => {
    const copied = update(
      start(),
      Message.GotClipboard({ message: ClipboardMessage.Copied(), what: 'the code' }),
    )
    expect(copied.commands?.map(command => command.args)).toEqual([{ status: 'Copied the code.' }])
    const newer = step(
      copied.model,
      Message.GotClipboard({ message: ClipboardMessage.Copied(), what: 'the document as JSON' }),
    )
    // The first status's time is up, but it is no longer the one shown.
    const kept = step(newer, Message.StatusExpired({ status: 'Copied the code.' }))
    expect(kept.status).toEqual(
      Option.some({ text: 'Copied the document as JSON.', failed: false }),
    )
    const gone = step(kept, Message.StatusExpired({ status: 'Copied the document as JSON.' }))
    expect(gone.status).toEqual(Option.none())
  })
})

describe('the link editor', () => {
  it('focuses its field as it opens, and closes on an edit with the text focused again', () => {
    const initial = start()
    const words = select(initial, over(runAt(initial, 0), 2, 6))
    const opened = update(words, Message.OpenedMenu({ menu: Menu.Link() }))
    expect(opened.commands?.map(command => command.args)).toEqual([
      { selector: '[data-link="address"]' },
    ])
    const linked = update(
      opened.model,
      Message.LinkEdited({
        message: EditorMessage.AppliedMark({
          mark: { name: 'Link', props: { href: 'https://example.com' } },
        }),
      }),
    )
    expect(openMenu(linked.model).link).toBe(false)
    expect(RichText.linkAt(linked.model.document, linked.model.editor.selection)?.href).toBe(
      'https://example.com',
    )
    expect(linked.commands?.map(command => command.name)).toContain('RichText.focus')
  })
})

describe('the contents', () => {
  it('jump to a heading: the caret at its start, and the editor focused there', () => {
    const initial = start()
    const index = kinds(initial).lastIndexOf('Heading')
    const heading = top(initial)[index]!
    const jumped = update(initial, Message.JumpedTo({ node: heading.id }))
    expect(jumped.model.editor.selection).toEqual(caret(runAt(initial, index)))
    expect(jumped.commands?.map(command => command.name)).toContain('RichText.focus')
  })
})

describe('footnotes', () => {
  it('insert after the caret with the next label, the caret in the new note', () => {
    const fresh = start()
    const initial = select(fresh, caret(runAt(fresh, 0), 1))
    const added = step(initial, edited(EditorMessage.InsertedFootnote({})))
    const notes = RichText.footnotesOf(added.document)
    expect(notes.map(note => note.label)).toEqual(['2', '1'])
    const last = top(added).at(-1)!
    expect(last.id).toBe(notes[0]!.definition)
    expect(textOf(top(added)[0]!)).toBe(
      `${textOf(top(initial)[0]!).slice(0, 1)}2${textOf(top(initial)[0]!).slice(1)}`,
    )
  })

  it('go back from a note’s arrow to the reference, with the editor focused there', () => {
    const initial = start()
    const [note] = RichText.footnotesOf(initial.document)
    const back = update(
      initial,
      edited(
        EditorMessage.ActivatedAdornment({ node: note!.definition!, action: RETURN_TO_REFERENCE }),
      ),
    )
    const reference = RichText.locateRun(initial.document, note!.references[0]!)!.run
    expect(back.model.editor.selection).toMatchObject({
      anchor: { node: reference.id, offset: reference.text.length },
      focus: { node: reference.id, offset: reference.text.length },
    })
    expect(back.commands?.map(command => command.name)).toContain('RichText.focus')
  })
})

describe('menus', () => {
  it('one at a time, read as what is open', () => {
    const initial = start()
    const node = top(initial)[0]!.id
    expect(openMenu(step(initial, Message.OpenedMenu({ menu: Menu.Insert() })))).toMatchObject({
      insert: true,
      link: false,
    })
    const caption = openMenu(step(initial, Message.OpenedMenu({ menu: Menu.Caption({ node }) })))
    expect(Option.getOrUndefined(caption.block)).toEqual({ node, caption: true })
  })

  it('a no-op keeps the Model', () => {
    const model = start()
    // The browser reporting the selection the editor already has.
    expect(update(model, edited(EditorMessage.Selected({ selection: null }))).model).toBe(model)
    expect(update(model, Message.SlashMoved({ index: 0 })).model).toBe(model)
    expect(update(model, Message.ClosedMenu()).model).toBe(model)
  })
})

it('Reset returns to the starting document and forgets the discussions', () => {
  const changed = step(start(), Message.Resolved({ thread: firstThread }))
  const reset = step(changed, Message.Reset())
  expect(openThreads(reset).map(thread => thread.id)).toEqual([firstThread])
  expect(RichText.canUndo(reset.editor.history)).toBe(false)
})
