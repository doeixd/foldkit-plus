/**
 * The Markdown block input rules (§124 §4): completing a heading marker at a block's start
 * retypes the block, a quote or list marker wraps it, and a fence converts it to code.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { markdownInputRules } from '../src/input.js'
import { parse } from '../src/parse.js'
import { print } from '../src/print.js'

/** The first rule that has something to say about this text, as the editor would find it. */
const match = (textBefore: string) => {
  for (const rule of markdownInputRules) {
    const matched = rule.match(textBefore)
    if (matched !== undefined) return { name: rule.name, ...matched }
  }
  return undefined
}

describe('the Markdown block input rules', () => {
  it('retypes a block when a heading marker is completed at its start', () => {
    expect(match('# ')).toEqual({
      name: 'heading-1',
      remove: 2,
      commands: [{ type: 'RetypeBlock', to: { type: 'Heading', level: 1 } }],
    })
    expect(match('###### ')).toEqual({
      name: 'heading-6',
      remove: 7,
      commands: [{ type: 'RetypeBlock', to: { type: 'Heading', level: 6 } }],
    })
  })

  it('reads the level from the run of hashes, not from the space alone', () => {
    expect(match('### ')?.commands).toEqual([
      { type: 'RetypeBlock', to: { type: 'Heading', level: 3 } },
    ])
    // The space is part of the marker, so one more hash is a different rule.
    expect(match('## ')).not.toEqual(match('### '))
  })

  it('claims nothing mid-block, over-deep, or under-complete', () => {
    for (const text of ['see # ', '####### ', '#', '# text', '#  ']) {
      expect(match(text)).toBeUndefined()
    }
  })

  it('wraps a block in a quote or a list when their marker is completed', () => {
    const list = [{ kind: 'List' }, { kind: 'ListItem' }]
    expect(match('> ')).toEqual({
      name: 'quote',
      remove: 2,
      commands: [{ type: 'WrapBlock', containers: [{ kind: 'Quote' }] }],
    })
    for (const bullet of ['- ', '* ', '+ ']) {
      expect(match(bullet)).toEqual({
        name: 'bullet-list',
        remove: 2,
        commands: [{ type: 'WrapBlock', containers: list }],
      })
    }
  })

  it('starts an ordered list at the number typed', () => {
    const ordered = (props: Record<string, unknown>) => [
      { type: 'WrapBlock', containers: [{ kind: 'List', props }, { kind: 'ListItem' }] },
    ]
    expect(match('1. ')).toEqual({
      name: 'ordered-list',
      remove: 3,
      commands: ordered({ ordered: true }),
    })
    expect(match('12) ')).toEqual({
      name: 'ordered-list',
      remove: 4,
      commands: ordered({ ordered: true, start: 12 }),
    })
  })

  it('converts a block to code when a fence is completed, with the language after it', () => {
    const code = (props: Record<string, unknown>) => [
      { type: 'ConvertBlock', to: { kind: 'CodeBlock', props } },
    ]
    expect(match('``` ')).toEqual({ name: 'code-block', remove: 4, commands: code({}) })
    expect(match('~~~c++ ')?.commands).toEqual(code({ language: 'c++' }))
    expect(match('```ts ')).toEqual({
      name: 'code-block',
      remove: 6,
      commands: code({ language: 'ts' }),
    })
    expect(match('```` ')?.commands).toEqual(code({}))
    for (const text of ['`` ', '```ts', 'a ``` ', '```t s ', '``~ ', '```a`b ']) {
      expect(match(text)).toBeUndefined()
    }
  })

  it('claims no list or quote marker that is not the block’s whole start', () => {
    for (const text of ['a - ', '>', '-', '1.', '1234567890. ', ' - ', '-  ', '1 . ']) {
      expect(match(text)).toBeUndefined()
    }
  })
})

describe('the rules applied to a document, as the editor applies them', () => {
  /** Types `marker` then a space at the start of `body`, and returns the document after. */
  const typed = (marker: string, body: string) => {
    let count = 0
    const start: RichText.EditorState = {
      document: RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Paragraph',
            id: 'p',
            children: [{ type: 'Text', id: 't', text: `${marker}${body}`, marks: [] }],
          },
        ],
      }),
      selection: {
        type: 'Range',
        anchor: { node: RichText.NodeId.make('t'), offset: marker.length, affinity: 'after' },
        focus: { node: RichText.NodeId.make('t'), offset: marker.length, affinity: 'after' },
      },
    }
    const action = RichText.applyInputRules(markdownInputRules, {
      textBefore: marker,
      text: ' ',
      insertion: { type: 'InsertText', text: ' ' },
    })
    const result = RichText.runAction(
      start,
      action,
      { mint: () => `m${++count}` },
      { nodes: RichText.nodeRegistry(RichText.standardNodes) },
    )
    if (!result.ok) throw new Error(result.error)
    return result.state
  }

  it('turns `- ` into a list item holding the rest of the text, caret at its start', () => {
    const after = typed('-', 'milk')
    const [list] = after.document.children
    expect(list).toMatchObject({ type: 'Node', kind: 'List', props: {} })
    const item = list?.type === 'Node' ? list.blocks?.[0] : undefined
    expect(item).toMatchObject({ type: 'Node', kind: 'ListItem' })
    const paragraph = item?.type === 'Node' ? item.blocks?.[0] : undefined
    expect(paragraph).toMatchObject({ type: 'Paragraph', id: 'p' })
    expect(paragraph?.children.map(run => run.text).join('')).toBe('milk')
    expect(after.selection).toMatchObject({ anchor: { node: 't', offset: 0 } })
  })

  it('turns ```` ```ts ```` into a code block holding the rest of the text', () => {
    const after = typed('```ts', 'const x')
    const [code] = after.document.children
    expect(code).toMatchObject({ type: 'Node', kind: 'CodeBlock', props: { language: 'ts' } })
    expect(code?.children.map(run => run.text).join('')).toBe('const x')
    expect(after.selection).toMatchObject({ anchor: { offset: 0 } })
  })

  it('adds `- ` typed under a list to that list, so it prints as the one list it reads as', () => {
    let count = 0
    const mint = () => `m${++count}`
    const { document } = parse('- milk\n\n-eggs\n', { mint })
    const run = document.children[1]?.children[0]
    if (run === undefined) throw new Error('no paragraph after the list')
    const caret = { node: run.id, offset: 1, affinity: 'after' } as const
    const action = RichText.applyInputRules(markdownInputRules, {
      textBefore: '-',
      text: ' ',
      insertion: { type: 'InsertText', text: ' ' },
    })
    const result = RichText.runAction(
      { document, selection: { type: 'Range', anchor: caret, focus: caret } },
      action,
      { mint },
      { nodes: RichText.nodeRegistry(RichText.standardNodes) },
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.state.document.children).toHaveLength(1)
    expect(print(result.state.document).markdown).toBe('- milk\n- eggs\n')
  })

  it('turns `> ` into a quote, and `3. ` into a list numbered from three', () => {
    expect(typed('>', 'said').document.children[0]).toMatchObject({ kind: 'Quote' })
    expect(typed('3.', 'third').document.children[0]).toMatchObject({
      kind: 'List',
      props: { ordered: true, start: 3 },
    })
  })
})
