/**
 * Replicated text: character identity, translation from the editor's transactions, and
 * what concurrent edits do once a server has put them in one order.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const { Replicated } = RichText
const nodes = RichText.nodeRegistry(RichText.standardNodes)

const decode = (children: ReadonlyArray<unknown>) =>
  RichText.decodeDocument({ version: 1, children })
const text = (id: string, value: string, marks: ReadonlyArray<string> = []) => ({
  type: 'Text',
  id,
  text: value,
  marks,
})
const paragraph = (id: string, ...runs: ReadonlyArray<ReturnType<typeof text>>) => ({
  type: 'Paragraph',
  id,
  children: runs,
})
const container = (kind: string, id: string, props: object, blocks: ReadonlyArray<unknown>) => ({
  type: 'Node',
  kind,
  id,
  props,
  children: [],
  blocks,
})

/**
 * A document's content without identities: what two replicas must agree on, and what a
 * translation must reproduce. Adjacent runs with one mark set read as one, and empty runs
 * as nothing, because run boundaries are not content.
 */
const content = (document: RichText.Document): unknown => {
  const runs = (children: ReadonlyArray<RichText.Text>) => {
    const out: Array<{ text: string; marks: ReadonlyArray<string> }> = []
    for (const run of children) {
      if (run.text.length === 0) continue
      const marks = run.marks.map(mark => JSON.stringify(mark)).sort()
      const last = out[out.length - 1]
      if (last !== undefined && last.marks.join() === marks.join()) last.text += run.text
      else out.push({ text: run.text, marks })
    }
    return out
  }
  const block = (value: RichText.Block): unknown => {
    if (value.type === 'Paragraph') return { p: runs(value.children) }
    if (value.type === 'Heading') return { h: value.level, runs: runs(value.children) }
    if (value.type === 'Unknown') return { unknown: value.originalType, props: value.props }
    return {
      kind: value.kind,
      props: value.props,
      runs: runs(value.children),
      ...(value.blocks === undefined ? {} : { blocks: value.blocks.map(block) }),
    }
  }
  return document.children.map(block)
}

const counter = () => {
  let next = 0
  return { mint: () => `m${next++}` }
}

/** One replica's view: the state, and a caret or selection held by what it sits after. */
interface View {
  state: RichText.Replicated.ReplicatedState
  selection: RichText.Replicated.AnchoredSelection | null
}

let edits = 0
/** Runs a command on a view's projection and returns the ops it translates to. */
const edit = (
  view: View,
  command: RichText.Command,
): ReadonlyArray<RichText.Replicated.ReplicatedOp> => {
  const document = Replicated.project(view.state)
  const result = RichText.run(
    { document, selection: Replicated.resolve(view.state, view.selection) },
    command,
    counter(),
    { nodes },
  )
  if (!result.ok) throw new Error(`command refused: ${result.error}`)
  const translated = Replicated.translate(view.state, result, `e${edits++}:r`)
  const next = Replicated.applyOps(view.state, translated.ops)
  expect(content(Replicated.project(next))).toEqual(content(result.state.document))
  view.state = next
  view.selection = translated.selection
  return translated.ops
}

/** A caret after the `offset`th visible character of the block holding `needle`. */
const caretIn = (
  view: View,
  needle: string,
  offset: number,
): RichText.Replicated.AnchoredSelection => {
  const document = Replicated.project(view.state)
  let found: RichText.Selection | undefined
  const visit = (blocks: ReadonlyArray<RichText.Block>) => {
    for (const block of blocks) {
      const joined = block.children.map(run => run.text).join('')
      if (found === undefined && block.children.length > 0 && joined.includes(needle)) {
        let rest = offset
        for (const run of block.children) {
          if (rest <= run.text.length) {
            const at = { node: run.id, offset: rest, affinity: 'after' as const }
            found = { type: 'Range', anchor: at, focus: at }
            break
          }
          rest -= run.text.length
        }
      }
      if (block.type === 'Node' && block.blocks !== undefined) visit(block.blocks)
    }
  }
  visit(document.children)
  if (found === undefined) throw new Error(`no block holds ${needle}`)
  return Replicated.anchor(view.state, found)!
}

const texts = (state: RichText.Replicated.ReplicatedState): ReadonlyArray<string> => {
  const out: Array<string> = []
  const visit = (blocks: ReadonlyArray<RichText.Block>) => {
    for (const block of blocks) {
      if (block.type === 'Node' && block.blocks !== undefined) visit(block.blocks)
      else out.push(block.children.map(run => run.text).join(''))
    }
  }
  visit(Replicated.project(state).children)
  return out
}

const base = () =>
  Replicated.fromDocument(
    decode([
      { type: 'Heading', id: 'h', level: 1, children: [text('ht', 'Title')] },
      paragraph('p', text('a', 'hello '), text('b', 'world', ['Bold'])),
      container('List', 'l', { ordered: false }, [
        container('TaskItem', 't', { checked: false }, [paragraph('tp', text('c', 'milk'))]),
        container('ListItem', 'i', {}, [paragraph('ip', text('d', 'eggs'))]),
      ]),
      container('Quote', 'q', {}, [paragraph('qp', text('e', 'quoted'))]),
      paragraph('z', text('f', 'last')),
    ]),
    'base:0',
  )

const { ReplicatedId } = Replicated
const idAt = (state: RichText.Replicated.ReplicatedState, path: RichText.BlockPath) =>
  ReplicatedId.make(RichText.blockAtPath(Replicated.project(state), path)!.id)
/** The key of the insert that made a block's first run, in a state made by `fromDocument`. */
const keyAt = (state: RichText.Replicated.ReplicatedState, path: RichText.BlockPath) => {
  const run = RichText.blockAtPath(Replicated.project(state), path)!.children[0]!.id
  return run.slice(0, run.lastIndexOf('.'))
}
const charAt = (
  state: RichText.Replicated.ReplicatedState,
  path: RichText.BlockPath,
  index: number,
) => Replicated.CharRef.make(`${keyAt(state, path)}.${index}`)

/** A seeded generator, so a failing session replays exactly. */
const seeded = (seed: number) => {
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const pick = <A>(values: ReadonlyArray<A>): A => values[Math.floor(next() * values.length)]!
  return { next, pick }
}

/**
 * One random edit at a random selection in `view`: the ops it translated to, or undefined
 * when the editor refused the command there (no container to lift out of, say).
 */
const randomEdit = (
  view: View,
  { next, pick }: ReturnType<typeof seeded>,
): ReadonlyArray<RichText.Replicated.ReplicatedOp> | undefined => {
  const filled = texts(view.state).filter(value => value.length > 0)
  if (filled.length === 0) return undefined
  const blocks: Array<RichText.Block> = []
  const collect = (list: ReadonlyArray<RichText.Block>) => {
    for (const block of list) {
      blocks.push(block)
      if (block.type === 'Node' && block.blocks !== undefined) collect(block.blocks)
    }
  }
  collect(Replicated.project(view.state).children)
  const point = () => {
    const needle = pick(filled)
    const at = caretIn(view, needle, Math.floor(next() * (needle.length + 1)))
    if (at.type !== 'Range') throw new Error('expected a caret')
    return at.anchor
  }
  const anchor = point()
  view.selection = { type: 'Range', anchor, focus: next() < 0.3 ? point() : anchor }
  const tasks = blocks.filter(block => block.type === 'Node' && block.kind === 'TaskItem')
  const command = pick<RichText.Command>([
    { type: 'InsertText', text: pick(['x', 'yz', ' ', 'long words']) },
    { type: 'DeleteBackward' },
    { type: 'DeleteForward' },
    { type: 'SplitBlock' },
    { type: 'ToggleMark', mark: 'Bold' },
    { type: 'ToggleMark', mark: 'Italic' },
    { type: 'RetypeBlock', to: { type: 'Heading', level: 2 } },
    { type: 'RetypeBlock', to: { type: 'Paragraph' } },
    { type: 'WrapBlock', containers: [{ kind: 'Quote' }] },
    {
      type: 'WrapBlock',
      containers: [
        { kind: 'List', props: {} },
        { kind: 'TaskItem', props: { checked: false } },
      ],
    },
    { type: 'LiftBlock' },
    { type: 'MoveBlock', node: pick(blocks).id, to: { before: pick(blocks).id } },
    { type: 'MoveBlock', node: pick(blocks).id, to: { after: pick(blocks).id } },
    ...(tasks.length === 0
      ? []
      : [{ type: 'SetProps' as const, node: pick(tasks).id, props: { checked: next() < 0.5 } }]),
    {
      type: 'Paste',
      slice: {
        version: 1,
        blocks: decode([
          paragraph('x', text('xa', 'one')),
          paragraph('y', text('ya', 'two', ['Italic'])),
        ]).children,
      },
    },
  ])
  try {
    return edit(view, command)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('command refused')) return undefined
    throw error
  }
}

describe('a replicated document', () => {
  it('shows the document it was made from, under new identities', () => {
    const document = decode([
      paragraph('p', text('a', 'plain '), text('b', 'bold', ['Bold'])),
      container('List', 'l', { ordered: true }, [
        container('ListItem', 'i', {}, [paragraph('ip', text('c', 'item'))]),
      ]),
      { type: 'Node', kind: 'Image', id: 'img', props: { src: '/x.png' }, children: [] },
      paragraph('empty', text('e', '')),
    ])
    const projected = Replicated.project(Replicated.fromDocument(document, 'doc:0'))
    expect(content(projected)).toEqual(content(document))
    // The projection is itself a valid document, so every editor path can read it.
    expect(RichText.decodeDocument(projected)).toEqual(projected)
    expect(projected.children[0]?.id).not.toBe('p')
  })

  it('names its runs by their first character, so a run keeps its id while text is added after it', () => {
    const view: View = { state: base(), selection: null }
    const before = Replicated.project(view.state).children[1]!.children[0]!.id
    view.selection = caretIn(view, 'hello', 3)
    edit(view, { type: 'InsertText', text: 'p' })
    expect(Replicated.project(view.state).children[1]!.children[0]!.id).toBe(before)
  })
})

describe('translating an edit', () => {
  // Seeded sessions of mixed edits: each step's projection has to match what the editor
  // made of the same command, which is what `edit` asserts. Every op kind has to turn up,
  // or the sessions are not testing what they claim to.
  it.each([11, 29, 71])('reproduces what the editor did, across a long session (seed %i)', seed => {
    const random = seeded(seed)
    const view: View = { state: base(), selection: null }
    const seen = new Set<string>()
    let applied = 0
    for (let step = 0; step < 400; step++) {
      const ops = randomEdit(view, random)
      if (ops === undefined) continue
      for (const op of ops) seen.add(op.type)
      applied++
    }
    expect(applied).toBeGreaterThan(200)
    expect([...seen].sort()).toEqual([
      'Delete',
      'DeleteBlock',
      'Insert',
      'InsertBlock',
      'Join',
      'Mark',
      'MoveBlock',
      'Retype',
      'SetProps',
      'Split',
      'Unmark',
    ])
  })

  it('translates a block moved into another container', () => {
    const view: View = { state: base(), selection: null }
    const document = Replicated.project(view.state)
    const quoted = RichText.blockAtPath(document, [3, 0])!.id
    const milk = RichText.blockAtPath(document, [2, 0, 0])!.id
    edit(view, { type: 'MoveBlock', node: quoted, to: { before: milk } })
    expect(texts(view.state)).toEqual(['Title', 'hello world', 'quoted', 'milk', 'eggs', 'last'])
  })

  it('translates ticking a task', () => {
    const view: View = { state: base(), selection: null }
    const list = Replicated.project(view.state).children[2]!
    if (list.type !== 'Node') throw new Error('fixture')
    const ops = edit(view, {
      type: 'SetProps',
      node: list.blocks![0]!.id,
      props: { checked: true },
    })
    expect(ops).toEqual([{ type: 'SetProps', id: list.blocks![0]!.id, props: { checked: true } }])
  })

  it('translates a paste of whole blocks', () => {
    const view: View = { state: base(), selection: null }
    view.selection = caretIn(view, 'last', 4)
    edit(view, {
      type: 'Paste',
      slice: {
        version: 1,
        blocks: decode([
          paragraph('x', text('xa', 'one')),
          paragraph('y', text('ya', 'two', ['Italic'])),
        ]).children,
      },
    })
    expect(texts(view.state).slice(-3)).toEqual(['last', 'one', 'two'])
  })

  it('carries the caret to where the edit left it', () => {
    const view: View = { state: base(), selection: null }
    view.selection = caretIn(view, 'hello', 5)
    edit(view, { type: 'InsertText', text: '!' })
    edit(view, { type: 'InsertText', text: '?' })
    expect(texts(view.state)[1]).toBe('hello!? world')
  })
})

describe('concurrent edits in server order', () => {
  /** Two replicas from one state, each editing without seeing the other. */
  const replicas = () => {
    const start = base()
    return {
      start,
      a: { state: start, selection: null } as View,
      b: { state: start, selection: null } as View,
    }
  }

  it('keeps both inserts in one paragraph where each was typed', () => {
    const { start, a, b } = replicas()
    a.selection = caretIn(a, 'hello', 0)
    const first = edit(a, { type: 'InsertText', text: 'A' })
    b.selection = caretIn(b, 'hello', 5)
    const second = edit(b, { type: 'InsertText', text: 'B' })
    // The server commits A's op first; B's replays on top of it.
    const committed = Replicated.applyOps(Replicated.applyOps(start, first), second)
    expect(texts(committed)[1]).toBe('AhelloB world')
  })

  it('keeps both inserts at one place, the later-committed first', () => {
    const { start, a, b } = replicas()
    a.selection = caretIn(a, 'hello', 5)
    const first = edit(a, { type: 'InsertText', text: 'A' })
    b.selection = caretIn(b, 'hello', 5)
    const second = edit(b, { type: 'InsertText', text: 'B' })
    const committed = Replicated.applyOps(Replicated.applyOps(start, first), second)
    expect(texts(committed)[1]).toBe('helloBA world')
  })

  it('puts text typed into a paragraph another replica split into the half that held its anchor', () => {
    const { start, a, b } = replicas()
    a.selection = caretIn(a, 'hello', 2)
    const split = edit(a, { type: 'SplitBlock' })
    b.selection = caretIn(b, 'hello', 4)
    const typed = edit(b, { type: 'InsertText', text: 'X' })
    const committed = Replicated.applyOps(Replicated.applyOps(start, split), typed)
    expect(texts(committed).slice(1, 3)).toEqual(['he', 'llXo world'])
  })

  it('keeps text typed at the start of a paragraph another replica joined to the one before', () => {
    const { start, a, b } = replicas()
    a.selection = caretIn(a, 'hello', 0)
    const joined = edit(a, { type: 'DeleteBackward' })
    b.selection = caretIn(b, 'hello', 0)
    const typed = edit(b, { type: 'InsertText', text: '>' })
    const committed = Replicated.applyOps(Replicated.applyOps(start, joined), typed)
    expect(texts(committed)[0]).toBe('Title>hello world')
  })

  it('does not bold a word another replica typed into the range before the mark arrived', () => {
    const { start, a, b } = replicas()
    const all = caretIn(a, 'hello', 0)
    const end = caretIn(a, 'hello', 5)
    if (all.type !== 'Range' || end.type !== 'Range') throw new Error('fixture')
    a.selection = { type: 'Range', anchor: all.anchor, focus: end.focus }
    const bolded = edit(a, { type: 'ToggleMark', mark: 'Italic' })
    b.selection = caretIn(b, 'hello', 2)
    const typed = edit(b, { type: 'InsertText', text: '_' })
    const committed = Replicated.applyOps(Replicated.applyOps(start, typed), bolded)
    const runs = Replicated.project(committed).children[1]!.children
    expect(runs.map(run => [run.text, run.marks])).toEqual([
      ['he', ['Italic']],
      ['_', []],
      ['llo', ['Italic']],
      [' ', []],
      ['world', ['Bold']],
    ])
  })

  it('loses text typed into a block another replica deleted', () => {
    const { start, b } = replicas()
    const block = idAt(start, [1])
    b.selection = caretIn(b, 'hello', 5)
    const typed = edit(b, { type: 'InsertText', text: '!' })
    const committed = Replicated.applyOps(
      Replicated.applyOps(start, [{ type: 'DeleteBlock', id: block }]),
      typed,
    )
    expect(texts(committed)).not.toContain('hello! world')
    expect(texts(committed)).toHaveLength(texts(start).length - 1)
  })

  it('keeps text typed into a block whose container another replica removed', () => {
    const { start, a, b } = replicas()
    a.selection = caretIn(a, 'quoted', 0)
    const lifted = edit(a, { type: 'LiftBlock' })
    b.selection = caretIn(b, 'quoted', 6)
    const typed = edit(b, { type: 'InsertText', text: '!' })
    // Lifting the only block out of a quote deletes the quote but keeps the block, so
    // the text lands: deletion of a container is not deletion of what it held.
    const committed = Replicated.applyOps(Replicated.applyOps(start, lifted), typed)
    expect(texts(committed)).toContain('quoted!')
  })

  it('falls back to the end of the block when an anchor never arrived', () => {
    const { start, a } = replicas()
    a.selection = caretIn(a, 'last', 4)
    const [rejected] = edit(a, { type: 'InsertText', text: 'X' })
    const later = edit(a, { type: 'InsertText', text: 'Y' })
    expect(rejected?.type).toBe('Insert')
    // The server refused the first insert; the second was anchored on its character.
    const committed = Replicated.applyOps(start, later)
    expect(texts(committed).at(-1)).toBe('lastY')
  })
})

describe('random concurrent sessions', () => {
  // Two replicas edit from one state without seeing each other; the server commits all of
  // one's ops, then the other's. Whatever that order does to the second's intent, the
  // result has to be a valid document that both can go on editing.
  it.each([3, 17, 43, 101])('merge into a document both can keep editing (seed %i)', seed => {
    const random = seeded(seed)
    const start = base()
    const a: View = { state: start, selection: null }
    const b: View = { state: start, selection: null }
    const opsA: Array<RichText.Replicated.ReplicatedOp> = []
    const opsB: Array<RichText.Replicated.ReplicatedOp> = []
    for (let step = 0; step < 25; step++) {
      opsA.push(...(randomEdit(a, random) ?? []))
      opsB.push(...(randomEdit(b, random) ?? []))
    }
    const merged = Replicated.applyOps(Replicated.applyOps(start, opsA), opsB)
    const projected = Replicated.project(merged)
    expect(RichText.decodeDocument(projected)).toEqual(projected)
    const view: View = { state: merged, selection: null }
    for (let step = 0; step < 10; step++) randomEdit(view, random)
  })
})

const caretOf = (selection: RichText.Selection | null): RichText.Position => {
  if (selection?.type !== 'Range') throw new Error('expected a caret')
  return selection.anchor
}

describe('a selection held by anchors', () => {
  it('stays after its character when another replica types before it', () => {
    const view: View = { state: base(), selection: null }
    view.selection = caretIn(view, 'world', 9)
    const other: View = { state: view.state, selection: caretIn(view, 'hello', 0) }
    edit(other, { type: 'InsertText', text: 'Oh, ' })
    const caret = caretOf(Replicated.resolve(other.state, view.selection))
    expect(RichText.textBefore(Replicated.project(other.state), caret)).toBe('Oh, hello wor')
  })

  it('moves back to the nearest character left when its own was deleted', () => {
    const view: View = { state: base(), selection: null }
    view.selection = caretIn(view, 'world', 9)
    const other: View = { state: view.state, selection: caretIn(view, 'world', 11) }
    edit(other, { type: 'DeleteBackward' })
    edit(other, { type: 'DeleteBackward' })
    edit(other, { type: 'DeleteBackward' })
    const caret = caretOf(Replicated.resolve(other.state, view.selection))
    expect(RichText.textBefore(Replicated.project(other.state), caret)).toBe('hello wo')
  })
})

describe('ops that no longer fit', () => {
  // Paths into `base()`: [1] the paragraph, [2] the list, [2, 0] its task item, [3] the
  // quote, [4] the last paragraph. Each case is an op the state has to shrug off, after the
  // setup ops that make it not fit; the result must show what the setup alone showed.
  const cases: ReadonlyArray<
    readonly [
      string,
      (state: RichText.Replicated.ReplicatedState) => {
        readonly setup: ReadonlyArray<RichText.Replicated.ReplicatedOp>
        readonly op: RichText.Replicated.ReplicatedOp
      },
    ]
  > = [
    [
      'an insert reusing an insert’s id',
      state => ({
        setup: [],
        op: {
          type: 'Insert',
          id: ReplicatedId.make(keyAt(state, [1])),
          block: idAt(state, [1]),
          after: null,
          text: 'x',
          marks: [],
        },
      }),
    ],
    [
      'an insert into a block that holds blocks, which shows no text',
      state => ({
        setup: [],
        op: {
          type: 'Insert',
          id: ReplicatedId.make('new:0'),
          block: idAt(state, [2]),
          after: null,
          text: 'x',
          marks: [],
        },
      }),
    ],
    [
      'a block reusing a block’s id',
      state => ({
        setup: [],
        op: {
          type: 'InsertBlock',
          id: idAt(state, [1]),
          shape: { type: 'Paragraph' },
          parent: null,
          after: null,
        },
      }),
    ],
    [
      'a block inserted into a parent that is not there',
      () => ({
        setup: [],
        op: {
          type: 'InsertBlock',
          id: ReplicatedId.make('new:0'),
          shape: { type: 'Paragraph' },
          parent: ReplicatedId.make('gone:0'),
          after: null,
        },
      }),
    ],
    [
      'a move into its own subtree',
      state => ({
        setup: [],
        op: { type: 'MoveBlock', id: idAt(state, [2]), parent: idAt(state, [2, 0]), after: null },
      }),
    ],
    [
      'a move into a parent that is not there',
      state => ({
        setup: [],
        op: {
          type: 'MoveBlock',
          id: idAt(state, [1]),
          parent: ReplicatedId.make('gone:0'),
          after: null,
        },
      }),
    ],
    [
      'a split reusing a block’s id',
      state => ({
        setup: [],
        op: {
          type: 'Split',
          block: idAt(state, [1]),
          after: charAt(state, [1], 1),
          into: idAt(state, [0]),
        },
      }),
    ],
    [
      'a split of a block that holds blocks',
      state => ({
        setup: [],
        op: {
          type: 'Split',
          block: idAt(state, [2]),
          after: null,
          into: ReplicatedId.make('new:0'),
        },
      }),
    ],
    [
      'a split of a deleted block',
      state => ({
        setup: [{ type: 'DeleteBlock', id: idAt(state, [1]) }],
        op: {
          type: 'Split',
          block: idAt(state, [1]),
          after: charAt(state, [1], 1),
          into: ReplicatedId.make('new:0'),
        },
      }),
    ],
    [
      'a join of a deleted block',
      state => ({
        setup: [{ type: 'DeleteBlock', id: idAt(state, [4]) }],
        op: { type: 'Join', into: idAt(state, [1]), removed: idAt(state, [4]) },
      }),
    ],
    [
      'a second join of one block',
      state => ({
        setup: [{ type: 'Join', into: idAt(state, [1]), removed: idAt(state, [4]) }],
        op: { type: 'Join', into: idAt(state, [0]), removed: idAt(state, [4]) },
      }),
    ],
    [
      'a join of a block with one it holds',
      state => ({
        setup: [],
        op: { type: 'Join', into: idAt(state, [2, 0]), removed: idAt(state, [2]) },
      }),
    ],
    [
      'a join of text with blocks',
      state => ({
        setup: [],
        op: { type: 'Join', into: idAt(state, [1]), removed: idAt(state, [3]) },
      }),
    ],
    [
      'a retype of a node',
      state => ({
        setup: [],
        op: { type: 'Retype', id: idAt(state, [2]), to: { type: 'Paragraph' } },
      }),
    ],
    [
      'props on a paragraph',
      state => ({
        setup: [],
        op: { type: 'SetProps', id: idAt(state, [1]), props: { checked: true } },
      }),
    ],
    [
      'a delete of a block that is not there',
      () => ({
        setup: [],
        op: { type: 'DeleteBlock', id: ReplicatedId.make('gone:0') },
      }),
    ],
  ]

  it.each(cases)('change nothing: %s', (_, make) => {
    const start = base()
    const { setup, op } = make(start)
    const before = Replicated.applyOps(start, setup)
    expect(Replicated.project(Replicated.applyOps(before, [op]))).toEqual(
      Replicated.project(before),
    )
  })

  it('puts a block whose sibling left its container at the container’s end', () => {
    const start = base()
    const id = ReplicatedId.make('new:0')
    const next = Replicated.applyOps(start, [
      {
        type: 'InsertBlock',
        id,
        shape: { type: 'Paragraph' },
        parent: null,
        after: idAt(start, [2, 0]),
      },
    ])
    expect(
      Replicated.project(next)
        .children.map(block => block.id)
        .at(-1),
    ).toBe(id)
  })

  it('shows an emptied text block as one empty run, so a caret has somewhere to be', () => {
    const start = base()
    const next = Replicated.applyOps(start, [
      { type: 'Delete', ranges: [{ id: ReplicatedId.make(keyAt(start, [4])), from: 0, to: 4 }] },
    ])
    const block = idAt(start, [4])
    expect(RichText.blockAtPath(Replicated.project(next), [4])?.children).toEqual([
      { type: 'Text', id: `${block}.0`, text: '', marks: [] },
    ])
  })
})

describe('translate', () => {
  it('follows a split at a run’s start, which the editor makes no run for', () => {
    const state = base()
    const document = Replicated.project(state)
    const run = RichText.blockAtPath(document, [1])!.children[0]!.id
    const result = RichText.apply({ document, selection: null }, [
      RichText.Edit.splitRun(run, 0, RichText.NodeId.make('new')),
      RichText.Edit.addMark(run, 'Italic'),
    ])
    if (!result.ok) throw new Error(result.error)
    const { ops } = Replicated.translate(state, result, 'split:0')
    expect(content(Replicated.project(Replicated.applyOps(state, ops)))).toEqual(
      content(result.state.document),
    )
  })

  it('throws for transactions made on another document', () => {
    const other = RichText.apply(
      { document: decode([paragraph('p', text('a', 'x'))]), selection: null },
      [RichText.Edit.insertText(RichText.Node.make('a').at(1, 'after'), 'y')],
    )
    if (!other.ok) throw new Error(other.error)
    expect(() => Replicated.translate(base(), other, 'other:0')).toThrow()
  })
})

describe('identities', () => {
  it.each(['__proto__', 'constructor', 'toString', 'plain', 'a.b:c'])('refuse %s', id => {
    expect(Schema.is(ReplicatedId)(id)).toBe(false)
  })

  it('keep a prototype name out of a stored state’s block record', () => {
    // A key the key schema refuses is dropped by a plain decode and refused by a strict
    // one; either way it never reaches the record that ops index directly.
    const entry = {
      shape: { type: 'Paragraph' },
      parent: null,
      spans: [],
      children: [],
      deleted: false,
    }
    const stored = { version: 1, root: [], blocks: { constructor: entry } }
    const decoded = Schema.decodeUnknownSync(Replicated.ReplicatedState)(stored)
    expect(Object.hasOwn(decoded.blocks, 'constructor')).toBe(false)
    expect(() =>
      Schema.decodeUnknownSync(Replicated.ReplicatedState, { onExcessProperty: 'error' })(stored),
    ).toThrow()
  })
})
