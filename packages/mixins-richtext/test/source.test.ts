// @vitest-environment jsdom
/**
 * The Markdown source editor in an application that keeps `SourceSession | null`: the text
 * is the draft, a warning appears once an edit would lose something, and the way back
 * commits what `closeSource` returns.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { closeSource, openSource, print, type SourceSession } from 'foldkit-richtext-markdown'
import { describe, expect, it } from 'vitest'
import { sourceEditor, sourcePreview } from '../src/index.js'

const Message = defineMessageUnion({
  Drafted: { draft: Schema.String },
  Moved: { caret: Schema.Number },
  LeftSource: {},
})
type Message = typeof Message.Type

/** A paragraph whose mark Markdown has no syntax for. */
const original = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 'p-t', text: 'marked', marks: ['Highlight'] }],
    },
  ],
})

interface Model {
  readonly document: RichText.Document
  readonly source: SourceSession | null
  /** Where closing put the caret, as `run:offset`. */
  readonly caret?: string
}

let minted = 0
const update = (model: Model, message: Message): { readonly model: Model } => {
  if (model.source === null) return { model }
  if (message._tag === 'Drafted')
    return { model: { ...model, source: { ...model.source, draft: message.draft } } }
  if (message._tag === 'Moved')
    return { model: { ...model, source: { ...model.source, caret: message.caret } } }
  const closed = closeSource(model.source, model.document, { mint: () => `m${++minted}` })
  const focus = closed.selection?.type === 'Range' ? closed.selection.focus : undefined
  return {
    model: {
      document: closed.document,
      source: null,
      ...(focus === undefined ? {} : { caret: `${focus.node}:${focus.offset}` }),
    },
  }
}

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      model.source === null
        ? h.div(
            [],
            [
              h.p(
                [h.Id('rich')],
                [model.document === original ? 'untouched' : print(model.document).markdown],
              ),
              h.p([h.Id('caret')], [model.caret ?? '']),
            ],
          )
        : // Split mode: the source beside what it would become.
          h.div(
            [],
            [
              sourceEditor<Message>()(
                {
                  session: model.source,
                  document: model.document,
                  drafted: draft => Message.Drafted({ draft }),
                  moved: caret => Message.Moved({ caret }),
                  done: Message.LeftSource(),
                },
                h,
              ),
              sourcePreview<Message>()({ session: model.source, document: model.document }, h),
            ],
          ),
    ],
  )

const opened = (): Model => ({ document: original, source: openSource(original) })
const text = '[data-source="text"]'
/** The text area's caret Mount, as if the caret had moved to `caret`: the application's Message. */
const caretAt = (caret: number) =>
  Scene.Mount.resolve({ name: 'RichTextSourceCaret' }, Message.Moved({ caret }))

describe('the Markdown source editor', () => {
  it('shows the draft, and switches back untouched when nothing was typed', () => {
    Scene.scene(
      { update, view },
      Scene.given(opened()),
      Scene.expect(Scene.selector(text)).toHaveValue('marked\n'),
      Scene.expect(Scene.selector('[data-code]')).toBeAbsent(),
      // The caret the text area reports is where closing puts it in the document.
      caretAt(3),
      Scene.click('[data-source="done"]'),
      Scene.Mount.expectEnded({ name: 'RichTextSourceCaret' }),
      Scene.expect(Scene.selector('#rich')).toHaveText('untouched'),
      Scene.expect(Scene.selector('#caret')).toHaveText('p-t:3'),
    )
  })

  it('opens the text area at the session’s caret', () => {
    const at = { node: RichText.NodeId.make('p-t'), offset: 3, affinity: 'after' } as const
    const source = openSource(original, { selection: { type: 'Range', anchor: at, focus: at } })
    Scene.scene(
      { update, view },
      Scene.given<Model>({ document: original, source }),
      Scene.Mount.expectExact({ name: 'RichTextSourceCaret', args: { caret: 3 } }),
      caretAt(3),
    )
  })

  it('warns what an edit loses, then commits the edited Markdown', () => {
    Scene.scene(
      { update, view },
      Scene.given(opened()),
      caretAt(0),
      Scene.type(text, 'marked, and *more*\n'),
      Scene.expect(Scene.selector('[data-code="UnsupportedMark"]')).toHaveText(
        'Highlight formatting has no Markdown and will be lost',
      ),
      Scene.click('[data-source="done"]'),
      Scene.Mount.expectEnded({ name: 'RichTextSourceCaret' }),
      Scene.expect(Scene.selector('#rich')).toHaveText('marked, and *more*\n'),
    )
  })

  it('previews the draft as the document it would become, before and after an edit', () => {
    Scene.scene(
      { update, view },
      Scene.given(opened()),
      caretAt(0),
      Scene.expect(Scene.selector('[data-source="preview"] p')).toHaveText('marked'),
      Scene.type(text, '# Heading\n\nbody\n'),
      Scene.expect(Scene.selector('[data-source="preview"] h1')).toHaveText('Heading'),
      Scene.expect(Scene.selector('[data-source="preview"] p')).toHaveText('body'),
    )
  })

  it('previews the document the caller holds now while the draft is unedited', () => {
    // A document can change under an open, unedited session — a collaborator's edit, say —
    // and closing would give back the current one, so the preview must show it too.
    interface Node {
      readonly text?: string
      readonly children?: ReadonlyArray<Node>
    }
    const textOf = (node: Node): string =>
      (node.text ?? '') + (node.children ?? []).map(textOf).join('')
    const session = openSource(original)
    const preview = (document: RichText.Document) =>
      textOf(
        sourcePreview<Message>()({ session, document }, SlotView.inertBuilder()) as unknown as Node,
      )
    const changed = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'q',
          children: [{ type: 'Text', id: 'q-t', text: 'changed elsewhere', marks: [] }],
        },
      ],
    })
    expect(preview(original)).toBe('marked')
    expect(preview(changed)).toBe('changed elsewhere')
  })
})
