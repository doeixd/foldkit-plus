import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const position = (offset: number, affinity: 'before' | 'after' = 'after'): RichText.Position => ({
  node: id('t'),
  offset,
  affinity,
})
const initial = (): RichText.EditorState => ({
  document: RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 't', text: 'abcd', marks: ['Bold'] },
          { type: 'Text', id: 'other', text: 'unchanged', marks: [] },
        ],
      },
      { type: 'Heading', id: 'h', level: 1, children: [] },
    ],
  }),
  selection: { type: 'Range', anchor: position(3), focus: position(1, 'before') },
})
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('the state boundary', () => {
  // Every case is built from blocks that already passed validation in `initial()`, so a
  // check that trusted a remembered block where it should not would let the case through.
  const valid = initial()
  const [paragraph, heading] = valid.document.children as [RichText.Block, RichText.Block]
  const insert: RichText.Transaction = [{ type: 'InsertText', at: position(1), text: 'x' }]
  const cases: ReadonlyArray<readonly [string, unknown]> = [
    ['an excess key on the state', { ...valid, extra: 1 }],
    ['an excess key on the document', { ...valid, document: { ...valid.document, extra: 1 } }],
    ['another version', { ...valid, document: { ...valid.document, version: 2 } }],
    [
      'children that are not a list',
      { ...valid, document: { version: 1, children: new Set([paragraph, heading]) } },
    ],
    [
      'a remembered block twice',
      { ...valid, document: { version: 1, children: [paragraph, heading, paragraph] } },
    ],
    [
      'a block with an excess key',
      { ...valid, document: { version: 1, children: [{ ...paragraph, extra: 1 }, heading] } },
    ],
    [
      'a selection on a node that is not there',
      { ...valid, selection: { type: 'Node', node: 'x' } },
    ],
    [
      'a selection with an excess key',
      { ...valid, selection: { type: 'Node', node: id('p'), extra: 1 } },
    ],
  ]

  it.each(cases)('refuses %s, every time', (_, state) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      // @ts-expect-error a state the schema refuses
      expect(RichText.apply(state, insert)).toEqual({ ok: false, error: 'InvalidInput' })
    }
  })

  it('accepts a new document made of blocks it has seen', () => {
    const reordered = {
      ...valid,
      document: { version: 1 as const, children: [heading, paragraph] },
    }
    expect(RichText.apply(reordered, insert).ok).toBe(true)
  })
})

describe('setting the selection inside a transaction', () => {
  it('checks it against the text the transaction has made so far', () => {
    const insert = { type: 'InsertText' as const, at: position(4), text: 'ef' }
    const caret = (offset: number) => ({
      type: 'SetSelection' as const,
      selection: { type: 'Range' as const, anchor: position(offset), focus: position(offset) },
    })
    // 'abcd' has become 'abcdef', so 6 is its end and 7 is past it.
    expect(RichText.apply(initial(), [insert, caret(6)]).ok).toBe(true)
    expect(RichText.apply(initial(), [insert, caret(7)])).toEqual({
      ok: false,
      error: 'InvalidSelection',
    })
  })

  it('accepts a node selection on a run as well as on a block', () => {
    for (const node of ['t', 'p']) {
      const select = {
        type: 'SetSelection' as const,
        selection: { type: 'Node' as const, node: id(node) },
      }
      expect(RichText.apply(initial(), [select]).ok).toBe(true)
    }
    const missing = {
      type: 'SetSelection' as const,
      selection: { type: 'Node' as const, node: id('x') },
    }
    expect(RichText.apply(initial(), [missing])).toEqual({ ok: false, error: 'InvalidSelection' })
  })
})

describe('retyping a block', () => {
  const nested = (): RichText.EditorState => ({
    document: RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 't', text: 'code', marks: [] }],
        },
        {
          type: 'Node',
          kind: 'Quote',
          id: 'q',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Paragraph',
              id: 'qp',
              children: [{ type: 'Text', id: 'qt', text: 'x', marks: [] }],
            },
          ],
        },
        { type: 'Unknown', id: 'u', originalType: 'Embed', props: {}, children: [] },
      ],
    }),
    selection: null,
  })
  const toCode = { type: 'Node' as const, kind: 'CodeBlock', props: { language: 'ts' } }

  it('makes a block of runs a node kind under its own identity, and back', () => {
    const coded = RichText.apply(nested(), [RichText.Edit.retypeBlock(id('p'), toCode)])
    if (!coded.ok) throw new Error(coded.error)
    expect(coded.state.document.children[0]).toEqual({
      type: 'Node',
      kind: 'CodeBlock',
      id: 'p',
      props: { language: 'ts' },
      children: [{ type: 'Text', id: 't', text: 'code', marks: [] }],
    })
    // The same kind with the same props again changes nothing; other props are a change.
    const again = RichText.apply(coded.state, [RichText.Edit.retypeBlock(id('p'), toCode)])
    expect(again.ok && again.state.document).toBe(coded.state.document)
    const python = RichText.apply(coded.state, [
      RichText.Edit.retypeBlock(id('p'), { ...toCode, props: { language: 'py' } }),
    ])
    expect(python.ok && python.state.document.children[0]).toMatchObject({
      props: { language: 'py' },
    })
    const back = RichText.apply(coded.state, [
      RichText.Edit.retypeBlock(id('p'), { type: 'Paragraph' }),
    ])
    expect(back.ok && back.state.document.children[0]).toMatchObject({ type: 'Paragraph', id: 'p' })
  })

  it.each([
    ['a node that holds blocks', 'q'],
    ['preserved content', 'u'],
  ])('refuses %s', (_, node) => {
    expect(RichText.apply(nested(), [RichText.Edit.retypeBlock(id(node), toCode)])).toEqual({
      ok: false,
      error: 'InvalidRange',
    })
  })
})

describe('text transactions', () => {
  it('applies sequential edits and maps backward selections in the same transition', () => {
    const state = initial()
    const result = success(
      RichText.apply(state, [
        { type: 'InsertText', at: position(1), text: '🌱' },
        { type: 'DeleteText', node: id('t'), from: 3, to: 5 },
      ]),
    )
    expect(result.state.document.children[0]?.children[0]).toEqual({
      type: 'Text',
      id: 't',
      text: 'a🌱d',
      marks: ['Bold'],
    })
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: position(3),
      focus: position(1, 'before'),
    })
    expect(result.positionMap).toEqual([
      { node: 't', from: 1, to: 1, inserted: 2 },
      { node: 't', from: 3, to: 5, inserted: 0 },
    ])
    expect(result.changeSet).toEqual({
      dirtyNodes: new Set(['p', 't']),
      insertedNodes: new Set(),
      removedNodes: new Set(),
      textChanged: new Set(['t']),
      structureChanged: false,
      selectionChanged: false,
    })
    expect(result.state.document.children[1]).toBe(state.document.children[1])
    expect(result.state.document.children[0]?.children[1]).toBe(
      state.document.children[0]?.children[1],
    )
    expect(state.document.children[0]?.children[0]?.text).toBe('abcd')
  })

  it.each([
    [0, 'after', 0],
    [1, 'before', 1],
    [1, 'after', 3],
    [4, 'after', 6],
  ] as const)('maps insertion at offset %s with %s affinity', (offset, affinity, expected) => {
    expect(
      RichText.mapPosition(position(offset, affinity), [
        { node: id('t'), from: 1, to: 1, inserted: 2 },
      ]),
    ).toEqual(position(expected, affinity))
  })

  it.each([0, 1, 2, 3, 4])('maps deletion around offset %s', offset => {
    expect(
      RichText.mapPosition(position(offset), [{ node: id('t'), from: 1, to: 3, inserted: 0 }]),
    ).toEqual(position(offset < 1 ? offset : offset <= 3 ? 1 : 2))
  })

  it('leaves positions on other nodes unchanged and composes position steps', () => {
    const steps: ReadonlyArray<RichText.PositionStep> = [
      { node: id('t'), from: 1, to: 1, inserted: 2 },
      { node: id('t'), from: 0, to: 1, inserted: 0 },
    ]
    const other = { ...position(2), node: id('other') }
    expect(RichText.mapPosition(other, steps)).toEqual(other)
    expect(RichText.mapPosition(position(2), steps)).toEqual(position(3))
  })

  it('uses the current document for explicit selections and maps subsequent edits', () => {
    const result = success(
      RichText.apply(initial(), [
        { type: 'InsertText', at: position(4), text: '!' },
        {
          type: 'SetSelection',
          selection: { type: 'Range', anchor: position(5), focus: position(5) },
        },
        { type: 'DeleteText', node: id('t'), from: 0, to: 2 },
      ]),
    )
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: position(3),
      focus: position(3),
    })
    expect(result.changeSet.selectionChanged).toBe(true)
  })

  it('preserves state identity for empty edits and unchanged selections', () => {
    const state = initial()
    const result = success(
      RichText.apply(state, [
        { type: 'InsertText', at: position(0), text: '' },
        { type: 'DeleteText', node: id('t'), from: 1, to: 1 },
        {
          type: 'SetSelection',
          selection: { type: 'Range', anchor: position(3), focus: position(1, 'before') },
        },
      ]),
    )
    expect(result.state).toBe(state)
    expect(result.positionMap).toEqual([])
    expect(result.changeSet).toEqual({
      dirtyNodes: new Set(),
      insertedNodes: new Set(),
      removedNodes: new Set(),
      textChanged: new Set(),
      structureChanged: false,
      selectionChanged: false,
    })
  })

  it('changes node and null selections without dirtying content', () => {
    const selected = success(
      RichText.apply(initial(), [
        { type: 'SetSelection', selection: { type: 'Node', node: id('h') } },
      ]),
    )
    expect(selected.state.selection).toEqual({ type: 'Node', node: id('h') })
    const cleared = success(
      RichText.apply(selected.state, [{ type: 'SetSelection', selection: null }]),
    )
    expect(cleared.state.selection).toBeNull()
    expect(cleared.changeSet).toEqual({
      dirtyNodes: new Set(),
      insertedNodes: new Set(),
      removedNodes: new Set(),
      textChanged: new Set(),
      structureChanged: false,
      selectionChanged: true,
    })
  })

  it('adds marks, then normalizes the newly adjacent equivalents', () => {
    const state = initial()
    const added = success(
      RichText.apply(state, [{ type: 'AddMark', node: id('other'), mark: 'Bold' }]),
    )
    expect(added.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 't', text: 'abcdunchanged', marks: ['Bold'] },
    ])
    expect(added.positionMap).toEqual([{ node: 'other', into: 't', at: 0, base: 4 }])
    expect(added.changeSet).toEqual({
      dirtyNodes: new Set(['p', 'other', 't']),
      insertedNodes: new Set(),
      removedNodes: new Set(['other']),
      textChanged: new Set(['other', 't']),
      structureChanged: false,
      selectionChanged: false,
    })
    expect(added.state.selection).toEqual(state.selection)
    expect(state.document.children[0]?.children[1]?.marks).toEqual([])

    const removed = success(
      RichText.apply(added.state, [{ type: 'RemoveMark', node: id('t'), mark: 'Bold' }]),
    )
    expect(removed.state.document.children[0]?.children[0]?.marks).toEqual([])
    expect(removed.positionMap).toEqual([])
    expect(removed.changeSet.textChanged).toEqual(new Set(['t']))
  })

  it('sets a mark value for its name, replacing props and no-opping on the same value', () => {
    const state = initial()
    const link = (href: string) => ({ name: 'Link', props: { href } })
    const added = success(
      RichText.apply(state, [{ type: 'AddMark', node: id('t'), mark: link('/a') }]),
    )
    expect(added.state.document.children[0]?.children[0]?.marks).toEqual(['Bold', link('/a')])

    // The same name with different props replaces the value: a run carries one
    // mark per name.
    const replaced = success(
      RichText.apply(added.state, [{ type: 'AddMark', node: id('t'), mark: link('/b') }]),
    )
    expect(replaced.state.document.children[0]?.children[0]?.marks).toEqual(['Bold', link('/b')])

    // The identical value changes nothing, so state identity is preserved.
    const same = success(
      RichText.apply(replaced.state, [{ type: 'AddMark', node: id('t'), mark: link('/b') }]),
    )
    expect(same.state).toBe(replaced.state)
    expect(same.changeSet.textChanged).toEqual(new Set())

    // Removal keys on the name, whatever the props.
    const removed = success(
      RichText.apply(replaced.state, [{ type: 'RemoveMark', node: id('t'), mark: 'Link' }]),
    )
    expect(removed.state.document.children[0]?.children[0]?.marks).toEqual(['Bold'])
  })

  it('treats redundant mark edits as no-ops preserving state identity', () => {
    const state = initial()
    const redundant = success(
      RichText.apply(state, [
        { type: 'AddMark', node: id('t'), mark: 'Bold' },
        { type: 'RemoveMark', node: id('other'), mark: 'Bold' },
      ]),
    )
    expect(redundant.state).toBe(state)
    expect(redundant.positionMap).toEqual([])
    expect(redundant.changeSet).toEqual({
      dirtyNodes: new Set(),
      insertedNodes: new Set(),
      removedNodes: new Set(),
      textChanged: new Set(),
      structureChanged: false,
      selectionChanged: false,
    })
  })

  it.each([
    [{ type: 'InsertText', at: { ...position(0), node: id('missing') }, text: '!' }, 'MissingText'],
    [{ type: 'AddMark', node: id('missing'), mark: 'Bold' }, 'MissingText'],
    [{ type: 'RemoveMark', node: id('p'), mark: 'Bold' }, 'MissingText'],
    [{ type: 'RemoveMark', node: id('missing'), mark: 'Bold' }, 'MissingText'],
    [{ type: 'InsertText', at: position(99), text: '!' }, 'InvalidRange'],
    [{ type: 'DeleteText', node: id('t'), from: 3, to: 2 }, 'InvalidRange'],
    [{ type: 'DeleteText', node: id('t'), from: 0, to: 99 }, 'InvalidRange'],
    [{ type: 'InsertText', at: position(-1), text: '!' }, 'InvalidInput'],
    [{ type: 'InsertText', at: position(0.5), text: '!' }, 'InvalidInput'],
    [
      { type: 'SetSelection', selection: { type: 'Node', node: id('missing') } },
      'InvalidSelection',
    ],
  ] satisfies ReadonlyArray<readonly [RichText.Operation, string]>)(
    'rejects atomically: %j',
    (operation, error) => {
      const state = initial()
      const result = RichText.apply(state, [
        { type: 'InsertText', at: position(0), text: 'first edit' },
        operation,
      ])
      expect(result).toEqual({ ok: false, error })
      expect(state.document.children[0]?.children[0]?.text).toBe('abcd')
    },
  )

  it('validates incoming state and operation shapes at the boundary', () => {
    expect(
      RichText.apply({ ...initial(), selection: { type: 'Node', node: id('missing') } }, []),
    ).toEqual({ ok: false, error: 'InvalidInput' })
    // @ts-expect-error Deliberately invalid wire operation.
    expect(RichText.apply(initial(), [{ type: 'RunScript', code: 'alert(1)' }])).toEqual({
      ok: false,
      error: 'InvalidInput',
    })
    // The operation layer checks shape, not vocabulary. A mark this version does
    // not define is preserved like any loaded one, and the publishing gate is
    // where it is caught; `run` refuses it at the command boundary instead.
    const raw = RichText.apply(initial(), [{ type: 'AddMark', node: id('t'), mark: 'Link' }])
    if (!raw.ok) throw new Error(raw.error)
    expect(RichText.findUnknownMarks(raw.state.document)).toEqual([{ node: 't', mark: 'Link' }])
  })
})
