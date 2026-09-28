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
  options: Parameters<typeof Replicated.translate>[3] = {},
): ReadonlyArray<RichText.Replicated.ReplicatedOp> => {
  const document = Replicated.project(view.state)
  const result = RichText.run(
    { document, selection: Replicated.resolve(view.state, view.selection) },
    command,
    counter(),
    { nodes },
  )
  if (!result.ok) throw new Error(`command refused: ${result.error}`)
  const translated = Replicated.translate(view.state, result, `e${edits++}:r`, options)
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
/** The last character of a block, in a state made by `fromDocument`. */
const lastCharOf = (state: RichText.Replicated.ReplicatedState, path: RichText.BlockPath) => {
  const runs = RichText.blockAtPath(Replicated.project(state), path)!.children
  const last = runs[runs.length - 1]!
  const dot = last.id.lastIndexOf('.')
  const offset = Number(last.id.slice(dot + 1)) + last.text.length - 1
  return Replicated.CharRef.make(`${last.id.slice(0, dot)}.${offset}`)
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
  options: Parameters<typeof Replicated.translate>[3] = {},
): ReadonlyArray<RichText.Replicated.ReplicatedOp> | undefined => {
  const attempt = (command: RichText.Command) => {
    try {
      return edit(view, command, options)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('command refused')) return undefined
      throw error
    }
  }
  // Typing on where the last edit left the caret, as a person does, when the session is
  // testing inserts that continue.
  if (options.continues !== undefined && view.selection !== null && next() < 0.3) {
    return attempt({ type: 'InsertText', text: pick(['x', 'yz', ' ']) })
  }
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
  return attempt(command)
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

describe('projecting', () => {
  it('keeps every block an edit did not touch as the same object', () => {
    const view: View = { state: base(), selection: null }
    const before = Replicated.project(view.state).children
    view.selection = caretIn(view, 'hello', 3)
    edit(view, { type: 'InsertText', text: 'p' })
    const after = Replicated.project(view.state).children
    const kept = after.filter((block, at) => block === before[at])
    // Only the block typed into is new; its siblings, and any container, are the same objects.
    expect(after.length).toBe(before.length)
    expect(kept.length).toBe(before.length - 1)
  })

  it('makes a container anew when a block inside it changes, and only then', () => {
    const view: View = { state: base(), selection: null }
    const [, , list, quote] = Replicated.project(view.state).children
    view.selection = caretIn(view, 'milk', 4)
    edit(view, { type: 'InsertText', text: 's' })
    const [, , listAfter, quoteAfter] = Replicated.project(view.state).children
    expect(listAfter).not.toBe(list)
    expect(texts(view.state)).toContain('milks')
    expect(quoteAfter).toBe(quote)
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

describe('undoing', () => {
  /**
   * A document with each run's marks in name order: a mark undo puts back goes last among
   * the run's marks, and the order of a run's marks means nothing.
   */
  const unordered = (document: RichText.Document): RichText.Document => {
    const blocks = (list: ReadonlyArray<RichText.Block>): ReadonlyArray<RichText.Block> =>
      list.map(block => ({
        ...block,
        children: block.children.map(run => ({
          ...run,
          marks: [...run.marks].sort((left, right) =>
            RichText.markName(left).localeCompare(RichText.markName(right)),
          ),
        })),
        ...(block.type === 'Node' && block.blocks !== undefined
          ? { blocks: blocks(block.blocks) }
          : {}),
      })) as ReadonlyArray<RichText.Block>
    return { ...document, children: blocks(document.children) }
  }

  // Every kind of edit, one at a time: the inverse takes the document back exactly, and the
  // inverse of the inverse puts the edit back.
  it.each([11, 29, 71])('takes back and redoes each edit of a long session (seed %i)', seed => {
    const random = seeded(seed)
    const view: View = { state: base(), selection: null }
    const kinds = new Set<string>()
    for (let step = 0; step < 300; step++) {
      const before = view.state
      const ops = randomEdit(view, random)
      if (ops === undefined) continue
      const after = view.state
      const undo = Replicated.invert(before, ops)
      for (const op of undo) kinds.add(op.type)
      const undone = Replicated.applyOps(after, undo)
      expect(unordered(Replicated.project(undone))).toEqual(unordered(Replicated.project(before)))
      const redone = Replicated.applyOps(undone, Replicated.invert(after, undo))
      expect(unordered(Replicated.project(redone))).toEqual(unordered(Replicated.project(after)))
    }
    // The inverses the session needed, so the property covers them.
    expect([...kinds].sort()).toEqual(
      expect.arrayContaining(['Delete', 'Join', 'Undelete', 'Unjoin', 'Retype', 'MoveBlock']),
    )
  })

  /** The ranges of a block's characters, as a Delete names them. */
  const charsOf = (state: RichText.Replicated.ReplicatedState, text: string) => {
    const document = Replicated.project(state)
    const block = document.children.find(
      candidate => candidate.children.map(run => run.text).join('') === text,
    )!
    const at = (run: RichText.Text, offset: number) =>
      ({ node: run.id, offset, affinity: 'after' }) as const
    const deleted = RichText.run(
      {
        document,
        selection: {
          type: 'Range',
          anchor: at(block.children[0]!, 0),
          focus: at(block.children.at(-1)!, block.children.at(-1)!.text.length),
        },
      },
      { type: 'DeleteBackward' },
      counter(),
      { nodes },
    )
    if (!deleted.ok) throw new Error(deleted.error)
    return Replicated.translate(state, deleted, 'probe:0').ops
  }

  it('brings back only what the edit deleted, not what someone else deleted before it', () => {
    const start = base()
    // Someone deletes 'last' first; then an op deleting it again arrives, as a concurrent
    // delete of the same text would.
    const theirs = charsOf(start, 'last')
    const deleted = Replicated.applyOps(start, theirs)
    const undo = Replicated.invert(deleted, theirs)
    expect(undo).toEqual([])
    // Undone where it was the one that deleted, the text comes back.
    expect(texts(Replicated.applyOps(deleted, Replicated.invert(start, theirs)))).toContain('last')
  })

  it('deletes again, on redo, only what an undelete brought back', () => {
    const start = base()
    const ops = charsOf(start, 'last')
    const deleted = Replicated.applyOps(start, ops)
    const undelete = Replicated.invert(start, ops)
    // Inverted where the text was never deleted, an undelete changed nothing to redo.
    expect(Replicated.invert(start, undelete)).toEqual([])
    expect(Replicated.invert(deleted, undelete)).toEqual(ops)
  })

  it('revives only a block the edit deleted', () => {
    const start = base()
    const block = idAt(start, [4])
    const gone = Replicated.applyOps(start, [{ type: 'DeleteBlock', id: block }])
    expect(Replicated.invert(gone, [{ type: 'DeleteBlock', id: block }])).toEqual([])
    expect(Replicated.invert(start, [{ type: 'DeleteBlock', id: block }])).toEqual([
      { type: 'UndeleteBlock', id: block },
    ])
  })

  it('splits a container join back out, with the blocks it held', () => {
    const start = Replicated.fromDocument(
      decode([
        container('Quote', 'q1', {}, [paragraph('a', text('at', 'one'))]),
        container('Quote', 'q2', {}, [paragraph('b', text('bt', 'two'))]),
      ]),
      'quotes:0',
    )
    const join: ReadonlyArray<RichText.Replicated.ReplicatedOp> = [
      { type: 'Join', into: idAt(start, [0]), removed: idAt(start, [1]), after: null },
    ]
    const joined = Replicated.applyOps(start, join)
    expect(Replicated.project(joined).children).toHaveLength(1)
    const undone = Replicated.applyOps(joined, Replicated.invert(start, join))
    expect(Replicated.project(undone)).toEqual(Replicated.project(start))
  })

  it('takes back one person’s edit and keeps what someone else did meanwhile', () => {
    const start = base()
    const a: View = { state: start, selection: null }
    const b: View = { state: start, selection: null }
    a.selection = caretIn(a, 'hello', 5)
    const mine = edit(a, { type: 'InsertText', text: ' there' })
    b.selection = caretIn(b, 'last', 4)
    const theirs = edit(b, { type: 'InsertText', text: '!' })
    const both = Replicated.applyOps(Replicated.applyOps(start, mine), theirs)
    const undone = Replicated.applyOps(both, Replicated.invert(start, mine))
    expect(texts(undone)).toEqual(texts(Replicated.applyOps(start, theirs)))
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

  it('keeps text typed into a paragraph another replica made a code block, in either order', () => {
    const { start, a, b } = replicas()
    a.selection = caretIn(a, 'last', 4)
    const converted = edit(a, { type: 'ConvertBlock', to: { kind: 'CodeBlock' } })
    b.selection = caretIn(b, 'last', 4)
    const typed = edit(b, { type: 'InsertText', text: '!' })
    for (const order of [
      [converted, typed],
      [typed, converted],
    ]) {
      const committed = order.reduce(Replicated.applyOps, start)
      const block = Replicated.project(committed).children.at(-1)
      expect(block).toMatchObject({ type: 'Node', kind: 'CodeBlock' })
      expect(block?.children.map(run => run.text).join('')).toBe('last!')
    }
  })

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

describe('concurrent joins', () => {
  const three = () =>
    Replicated.fromDocument(
      decode([
        paragraph('a', text('x', 'one')),
        paragraph('b', text('y', 'two')),
        paragraph('c', text('z', 'three')),
      ]),
      'three:0',
    )
  const both = () => {
    const start = three()
    return {
      start,
      a: { state: start, selection: null } as View,
      b: { state: start, selection: null } as View,
    }
  }

  it('keeps every text when two replicas each join a block into the one before it', () => {
    const { start, a, b } = both()
    a.selection = caretIn(a, 'two', 0)
    const first = edit(a, { type: 'DeleteBackward' })
    b.selection = caretIn(b, 'three', 0)
    const second = edit(b, { type: 'DeleteBackward' })
    expect(texts(Replicated.applyOps(Replicated.applyOps(start, first), second))).toEqual([
      'onetwothree',
    ])
  })

  it('puts a joined block after the text it followed, though the block it joined was split', () => {
    const { start, a, b } = both()
    a.selection = caretIn(a, 'one', 1)
    const split = edit(a, { type: 'SplitBlock' })
    b.selection = caretIn(b, 'two', 0)
    const joined = edit(b, { type: 'DeleteBackward' })
    expect(texts(Replicated.applyOps(Replicated.applyOps(start, split), joined))).toEqual([
      'o',
      'netwo',
      'three',
    ])
  })

  it('places a caret held at the start of a joined block where that block now begins', () => {
    const { a } = both()
    const caret = caretIn(a, 'two', 0)
    a.selection = caretIn(a, 'two', 0)
    edit(a, { type: 'DeleteBackward' })
    const resolved = Replicated.resolve(a.state, caret)
    expect(RichText.textBefore(Replicated.project(a.state), caretOf(resolved))).toBe('one')
  })
})

describe('random concurrent sessions', () => {
  // Two replicas edit from one state without seeing each other; the server commits all of
  // one's ops, then the other's. Whatever that order does to the second's intent, the
  // result has to be a valid document that both can go on editing.
  // Each replica continues only the inserts it made, and the server receives each one's ops
  // coalesced, which must show what that replica saw.
  const replica = () => {
    const minted = new Set<string>()
    const ops: Array<RichText.Replicated.ReplicatedOp> = []
    const options = { continues: (id: string) => minted.has(id) }
    const record = (made: ReadonlyArray<RichText.Replicated.ReplicatedOp> | undefined) => {
      for (const op of made ?? []) if (op.type === 'Insert') minted.add(op.id)
      ops.push(...(made ?? []))
    }
    return { ops, options, record }
  }

  it.each([3, 17, 43, 101])('merge into a document both can keep editing (seed %i)', seed => {
    const random = seeded(seed)
    const start = base()
    const a: View = { state: start, selection: null }
    const b: View = { state: start, selection: null }
    const ofA = replica()
    const ofB = replica()
    for (let step = 0; step < 25; step++) {
      ofA.record(randomEdit(a, random, ofA.options))
      ofB.record(randomEdit(b, random, ofB.options))
    }
    const opsA = Replicated.coalesce(ofA.ops)
    const opsB = Replicated.coalesce(ofB.ops)
    expect(Replicated.project(Replicated.applyOps(start, opsA))).toEqual(
      Replicated.project(a.state),
    )
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

describe('applying ops', () => {
  it('gives back the same state for the same ops on the same state', () => {
    const start = base()
    const ops: ReadonlyArray<RichText.Replicated.ReplicatedOp> = [
      { type: 'Delete', ranges: [{ id: ReplicatedId.make(keyAt(start, [4])), from: 0, to: 1 }] },
    ]
    expect(Replicated.applyOps(start, ops)).toBe(Replicated.applyOps(start, ops))
    // Equal ops in another array are another edit's, and are applied afresh.
    expect(Replicated.applyOps(start, [...ops])).not.toBe(Replicated.applyOps(start, ops))
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
        op: {
          type: 'Join',
          into: idAt(state, [1]),
          removed: idAt(state, [4]),
          after: lastCharOf(state, [1]),
        },
      }),
    ],
    [
      'a join into a block deleted since',
      state => ({
        setup: [{ type: 'DeleteBlock', id: idAt(state, [1]) }],
        op: {
          type: 'Join',
          into: idAt(state, [1]),
          removed: idAt(state, [4]),
          after: lastCharOf(state, [1]),
        },
      }),
    ],
    [
      'a second join of one block',
      state => ({
        setup: [
          {
            type: 'Join',
            into: idAt(state, [1]),
            removed: idAt(state, [4]),
            after: lastCharOf(state, [1]),
          },
        ],
        op: {
          type: 'Join',
          into: idAt(state, [0]),
          removed: idAt(state, [4]),
          after: lastCharOf(state, [0]),
        },
      }),
    ],
    [
      'a join after a character of the block it removes',
      state => ({
        setup: [],
        op: {
          type: 'Join',
          into: idAt(state, [1]),
          removed: idAt(state, [4]),
          after: lastCharOf(state, [4]),
        },
      }),
    ],
    [
      'a join of a container into one deleted since',
      state => ({
        setup: [{ type: 'DeleteBlock', id: idAt(state, [3]) }],
        op: { type: 'Join', into: idAt(state, [3]), removed: idAt(state, [2]), after: null },
      }),
    ],
    [
      'a join of a block with one it holds',
      state => ({
        setup: [],
        op: { type: 'Join', into: idAt(state, [2, 0]), removed: idAt(state, [2]), after: null },
      }),
    ],
    [
      'a join of text with blocks',
      state => ({
        setup: [],
        op: {
          type: 'Join',
          into: idAt(state, [1]),
          removed: idAt(state, [3]),
          after: lastCharOf(state, [1]),
        },
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

  it('puts a block inserted into a container joined since into the one it joined', () => {
    const start = base()
    const id = ReplicatedId.make('new:0')
    const next = Replicated.applyOps(start, [
      { type: 'Join', into: idAt(start, [3]), removed: idAt(start, [2]), after: null },
      {
        type: 'InsertBlock',
        id,
        shape: { type: 'Paragraph' },
        parent: idAt(start, [2]),
        after: null,
      },
    ])
    expect(RichText.blockAtPath(Replicated.project(next), [2, 0])?.id).toBe(id)
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
    expect(() => Replicated.translate(base(), other, 'other:0')).toThrow(/refused/)
  })
})

describe('translating what apply skips', () => {
  const translated = (
    state: RichText.Replicated.ReplicatedState,
    transaction: RichText.Transaction,
  ) => {
    const result = RichText.apply(
      { document: Replicated.project(state), selection: null },
      transaction,
    )
    if (!result.ok) throw new Error(result.error)
    return Replicated.translate(state, result, 'skip:0').ops
  }

  it('makes no op for a mark the run already has', () => {
    // It would bold again text another replica unbolded meanwhile.
    const state = base()
    const bold = RichText.blockAtPath(Replicated.project(state), [1])!.children[1]!.id
    expect(translated(state, [RichText.Edit.addMark(bold, 'Bold')])).toEqual([])
  })

  it('makes no op for a move to where the block already is', () => {
    const state = base()
    const block = RichText.blockAtPath(Replicated.project(state), [1])!.id
    expect(translated(state, [RichText.Edit.moveBlock(block, 1)])).toEqual([])
  })
})

describe('marks', () => {
  it('replace a same-named mark where it stands', () => {
    const state = Replicated.fromDocument(
      decode([
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            {
              type: 'Text',
              id: 'a',
              text: 'go',
              marks: [{ name: 'Link', props: { href: '/a' } }, 'Bold'],
            },
          ],
        },
      ]),
      'marks:0',
    )
    const link = { name: 'Link', props: { href: '/b' } }
    const next = Replicated.applyOps(state, [
      {
        type: 'Mark',
        ranges: [{ id: ReplicatedId.make(keyAt(state, [0])), from: 0, to: 2 }],
        mark: link,
      },
    ])
    expect(Replicated.project(next).children[0]!.children[0]!.marks).toEqual([link, 'Bold'])
  })
})

describe('identities', () => {
  it('refuse an id one batch of ops already minted', () => {
    const start = base()
    const block = idAt(start, [4])
    const id = ReplicatedId.make('new:0')
    const next = Replicated.applyOps(start, [
      { type: 'Insert', id, block, after: null, text: 'A', marks: [] },
      { type: 'Insert', id, block, after: null, text: 'B', marks: [] },
    ])
    expect(texts(next).at(-1)).toBe('Alast')
  })

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

describe('continuing an insert', () => {
  // Every edit here is this replica's own, minted under `e…`.
  const mine = { continues: (id: string) => id.startsWith('e') }
  /** A view with a caret at the end of the last paragraph of `base()`. */
  const atEnd = (): View => {
    const state = base()
    const view: View = { state, selection: null }
    view.selection = caretIn(view, 'last', 4)
    return view
  }
  const type = (
    view: View,
    value: string,
    options: Parameters<typeof Replicated.translate>[3] = mine,
  ) => edit(view, { type: 'InsertText', text: value }, options)
  type InsertOp = Extract<RichText.Replicated.ReplicatedOp, { type: 'Insert' }>
  const inserts = (ops: ReadonlyArray<RichText.Replicated.ReplicatedOp>) =>
    ops.filter((op): op is InsertOp => op.type === 'Insert')

  it('carries on its own last insert from the next index, and coalesces into one op', () => {
    const view = atEnd()
    const start = view.state
    const first = type(view, 'ab')
    const second = type(view, 'c')
    const [a] = inserts(first)
    const [c] = inserts(second)
    expect(c).toMatchObject({ id: a!.id, from: 2, after: `${a!.id}.1`, text: 'c' })

    const merged = Replicated.coalesce([...first, ...second])
    expect(merged).toEqual([{ ...a, text: 'abc' }])
    expect(Replicated.project(Replicated.applyOps(start, merged))).toEqual(
      Replicated.project(view.state),
    )
  })

  it.each([
    ['nothing accepts it', {}],
    ['it is not this replica’s', { continues: (id: string) => id.startsWith('other') }],
  ])('starts a new insert when %s', (_, options) => {
    const view = atEnd()
    const [a] = inserts(type(view, 'ab', options))
    const [c] = inserts(type(view, 'c', options))
    expect(c!.id).not.toBe(a!.id)
    expect(c).not.toHaveProperty('from')
  })

  it('starts a new insert for text typed inside its own, not at its end', () => {
    const view = atEnd()
    const [a] = inserts(type(view, 'abc'))
    view.selection = caretIn(view, 'lastabc', 5)
    const [b] = inserts(type(view, 'X'))
    expect(b!.id).not.toBe(a!.id)
    expect(texts(view.state).at(-1)).toBe('lastaXbc')
  })

  it('does not reuse the index of a character deleted from its end', () => {
    const view = atEnd()
    const [a] = inserts(type(view, 'abc'))
    edit(view, { type: 'DeleteBackward' })
    const [d] = inserts(type(view, 'd'))
    // `a.2` is a tombstone now; continuing from `a.2` would claim it a second time.
    expect(d!.id).not.toBe(a!.id)
    expect(texts(view.state).at(-1)).toBe('lastabd')
  })

  it('continues an insert this edit made, when one edit types twice', () => {
    const view = atEnd()
    const document = Replicated.project(view.state)
    const run = document.children.at(-1)!.children[0]!
    const at = (offset: number) => ({ node: run.id, offset, affinity: 'after' as const })
    const result = RichText.runAction(
      { document, selection: { type: 'Range', anchor: at(4), focus: at(4) } },
      [
        { type: 'InsertText', text: 'ab' },
        { type: 'InsertText', text: 'c' },
      ],
      counter(),
    )
    if (!result.ok) throw new Error(result.error)
    const { ops } = Replicated.translate(view.state, result, 'e-twice:r', mine)
    expect(Replicated.coalesce(ops)).toHaveLength(1)
    expect(texts(Replicated.applyOps(view.state, ops)).at(-1)).toBe('lastabc')
  })

  it('continues an insert once per place, when one edit types at one place twice', () => {
    const view = atEnd()
    type(view, 'ab')
    const document = Replicated.project(view.state)
    const run = document.children.at(-1)!.children[0]!
    const at = (offset: number) => ({ node: run.id, offset, affinity: 'after' as const })
    const caret = (offset: number): RichText.Selection => ({
      type: 'Range',
      anchor: at(offset),
      focus: at(offset),
    })
    // `c` continues the insert; `d` is typed after its `b` again, where `c` began.
    const result = RichText.runAction(
      { document, selection: caret(6) },
      [
        { type: 'InsertText', text: 'c' },
        { type: 'SetSelection', selection: caret(6) },
        { type: 'InsertText', text: 'd' },
      ],
      counter(),
    )
    if (!result.ok) throw new Error(result.error)
    const { ops } = Replicated.translate(view.state, result, 'e-again:r', mine)
    expect(texts(Replicated.applyOps(view.state, ops)).at(-1)).toBe('lastabdc')
  })

  it('refuses characters of an insert already in the state', () => {
    const view = atEnd()
    const [a] = inserts(type(view, 'ab'))
    const again = { ...a!, text: 'XY', from: 1, after: Replicated.CharRef.make(`${a!.id}.0`) }
    expect(texts(Replicated.applyOps(view.state, [again])).at(-1)).toBe('lastab')
    expect(Replicated.invert(view.state, [again])).toEqual([])
  })

  it('undoes only the characters a continuation added', () => {
    const view = atEnd()
    type(view, 'ab')
    const before = view.state
    const continued = type(view, 'c')
    const undo = Replicated.invert(before, continued)
    expect(texts(Replicated.applyOps(view.state, undo)).at(-1)).toBe('lastab')
  })

  it.each<[string, (continued: InsertOp) => InsertOp]>([
    ['another mark set', c => ({ ...c, marks: ['Bold'] })],
    ['another block', c => ({ ...c, block: ReplicatedId.make('other:0') })],
    ['another insert', c => ({ ...c, id: ReplicatedId.make('other:1') })],
    ['a gap in its indexes', c => ({ ...c, from: 3 })],
    ['another anchor', c => ({ ...c, after: Replicated.CharRef.make(`${c.id}.0`) })],
  ])('keeps a continuation with %s apart', (_, change) => {
    const view = atEnd()
    const first = type(view, 'ab')
    const [c] = inserts(type(view, 'c'))
    expect(Replicated.coalesce([...first, change(c!)])).toHaveLength(2)
  })

  it('keeps inserts apart when another op stands between them', () => {
    const view = atEnd()
    const first = type(view, 'ab')
    const [c] = inserts(type(view, 'c'))
    const between = { type: 'Unmark', ranges: [], name: 'Bold' } as const
    expect(Replicated.coalesce([...first, between, c!])).toHaveLength(3)
  })
})

describe('collecting tombstones', () => {
  const COLLECT: RichText.Replicated.ReplicatedOp = { type: 'Collect' }
  /** Every character the state keeps, shown or not. */
  const kept = (state: RichText.Replicated.ReplicatedState): number =>
    Object.values(state.blocks).reduce(
      (sum, entry) => sum + entry.spans.reduce((total, span) => total + span.text.length, 0),
      0,
    )
  /** The last paragraph of `base()`, `last`, with its first three characters deleted. */
  const deleted = () => {
    const start = base()
    const view: View = {
      state: start,
      selection: caretIn({ state: start, selection: null }, 'last', 3),
    }
    for (let step = 0; step < 3; step++) edit(view, { type: 'DeleteBackward' })
    return view
  }

  it('removes deleted text on the second collection, and shows the same document', () => {
    const { state } = deleted()
    const once = Replicated.applyOps(state, [COLLECT])
    expect(kept(once)).toBe(kept(state))
    const twice = Replicated.applyOps(once, [COLLECT])
    expect(kept(twice)).toBeLessThan(kept(state))
    expect(Replicated.project(twice)).toEqual(Replicated.project(state))
  })

  it('keeps a deletion made since the last collection for one more', () => {
    const view = deleted()
    view.state = Replicated.applyOps(view.state, [COLLECT])
    // A character inside its insert, so no marker is kept for it.
    view.selection = caretIn(view, 'quoted', 3)
    edit(view, { type: 'DeleteBackward' })
    const before = kept(view.state)
    const next = Replicated.applyOps(view.state, [COLLECT])
    // The three characters deleted first go; the one deleted after that collection stays.
    expect(kept(next)).toBe(before - 3)
    expect(kept(Replicated.applyOps(next, [COLLECT]))).toBe(before - 4)
  })

  it('lands text anchored on a collected character at the end of its block', () => {
    const start = base()
    const block = idAt(start, [4])
    const gone = charAt(start, [4], 1)
    const late = {
      type: 'Insert',
      id: ReplicatedId.make('late:0'),
      block,
      after: gone,
      text: 'X',
      marks: [],
    } as const
    const shown = (ops: ReadonlyArray<RichText.Replicated.ReplicatedOp>) =>
      texts(Replicated.applyOps(start, ops)).at(-1)
    const remove: RichText.Replicated.ReplicatedOp = {
      type: 'Delete',
      ranges: [{ id: ReplicatedId.make(keyAt(start, [4])), from: 0, to: 2 }],
    }
    expect(shown([remove, COLLECT, late])).toBe('Xst')
    expect(shown([remove, COLLECT, COLLECT, late])).toBe('stX')
  })

  it('keeps an insert’s last index, so text continued after a collection takes a new one', () => {
    const start = base()
    const view: View = {
      state: start,
      selection: caretIn({ state: start, selection: null }, 'last', 4),
    }
    const mine = { continues: (id: string) => id.startsWith('e') }
    const [typed] = edit(view, { type: 'InsertText', text: 'abc' }, mine)
    if (typed?.type !== 'Insert') throw new Error('expected an insert')
    const id = typed.id
    edit(view, { type: 'DeleteBackward' }, mine)
    edit(view, { type: 'DeleteBackward' }, mine)
    view.state = Replicated.applyOps(view.state, [COLLECT, COLLECT])
    view.selection = caretIn(view, 'lasta', 5)
    const [again] = edit(view, { type: 'InsertText', text: 'Z' }, mine)
    expect(again).not.toMatchObject({ id, from: 1 })
    // An op made before the collection, naming the old `b`, cannot delete the new text.
    const late = { type: 'Delete', ranges: [{ id, from: 1, to: 2 }] } as const
    expect(texts(Replicated.applyOps(view.state, [late])).at(-1)).toBe('lastaZ')
  })

  it('does not remove text brought back since it was marked', () => {
    const marked = Replicated.applyOps(deleted().state, [COLLECT])
    const id = ReplicatedId.make(keyAt(base(), [4]))
    const restored = Replicated.applyOps(marked, [
      { type: 'Undelete', ranges: [{ id, from: 0, to: 3 }] },
    ])
    expect(texts(Replicated.applyOps(restored, [COLLECT])).at(-1)).toBe('last')
  })

  it('removes a deleted block’s text but keeps the block, which comes back empty', () => {
    const start = base()
    const block = idAt(start, [4])
    const gone = Replicated.applyOps(start, [{ type: 'DeleteBlock', id: block }, COLLECT, COLLECT])
    expect(gone.blocks[block]!.spans.map(span => span.text).join('')).toBe('t')
    expect(texts(Replicated.applyOps(gone, [{ type: 'UndeleteBlock', id: block }])).at(-1)).toBe('')
    const back = Replicated.applyOps(start, [
      { type: 'DeleteBlock', id: block },
      COLLECT,
      { type: 'UndeleteBlock', id: block },
      COLLECT,
    ])
    expect(texts(back).at(-1)).toBe('last')
  })

  it.each<
    [
      string,
      (
        block: RichText.Replicated.ReplicatedId,
        id: RichText.Replicated.ReplicatedId,
        start: RichText.Replicated.ReplicatedState,
      ) => ReadonlyArray<RichText.Replicated.ReplicatedOp>,
    ]
  >([
    [
      'characters',
      (_, id) => [
        { type: 'Delete', ranges: [{ id, from: 0, to: 3 }] },
        COLLECT,
        { type: 'Undelete', ranges: [{ id, from: 0, to: 3 }] },
        { type: 'Delete', ranges: [{ id, from: 0, to: 3 }] },
      ],
    ],
    [
      'a block',
      block => [
        { type: 'DeleteBlock', id: block },
        COLLECT,
        { type: 'UndeleteBlock', id: block },
        { type: 'DeleteBlock', id: block },
      ],
    ],
    [
      'a block split back out of a join',
      (block, id, start) => [
        {
          type: 'Join',
          into: idAt(start, [1]),
          removed: block,
          after: lastCharOf(start, [1]),
        },
        COLLECT,
        { type: 'Unjoin', id: block, ranges: [{ id, from: 0, to: 4 }], children: [] },
        { type: 'DeleteBlock', id: block },
      ],
    ],
  ])('keeps %s deleted again after coming back for a whole interval', (_, ops) => {
    const start = base()
    const block = idAt(start, [4])
    const next = Replicated.applyOps(start, [
      ...ops(block, ReplicatedId.make(keyAt(start, [4])), start),
      COLLECT,
    ])
    expect(kept(next)).toBe(kept(start))
  })

  it('removes the text of a deleted block that also held deleted characters', () => {
    const start = base()
    const block = idAt(start, [4])
    const id = ReplicatedId.make(keyAt(start, [4]))
    const gone = Replicated.applyOps(start, [
      { type: 'Delete', ranges: [{ id, from: 0, to: 1 }] },
      { type: 'DeleteBlock', id: block },
      COLLECT,
      COLLECT,
    ])
    expect(gone.blocks[block]!.spans.map(span => span.text).join('')).toBe('t')
  })

  describe('ops from a replica offline across two collections', () => {
    // Two paragraphs, `abc` and `def`; the second is joined into the first, and its
    // characters deleted and collected. A replica that saw neither types into it.
    const joined = () => {
      const start = Replicated.fromDocument(
        decode([paragraph('p', text('a', 'abc')), paragraph('q', text('d', 'def'))]),
        'two:0',
      )
      const first = idAt(start, [0])
      const second = idAt(start, [1])
      const def = ReplicatedId.make(keyAt(start, [1]))
      return {
        start,
        second,
        def,
        gone: Replicated.applyOps(start, [
          { type: 'Join', into: first, removed: second, after: charAt(start, [0], 2) },
          { type: 'Delete', ranges: [{ id: def, from: 0, to: 3 }] },
          COLLECT,
          COLLECT,
        ]),
      }
    }
    const insert = (
      id: string,
      block: RichText.Replicated.ReplicatedId,
      after: RichText.Replicated.CharRef | null,
      value: string,
    ): RichText.Replicated.ReplicatedOp => ({
      type: 'Insert',
      id: ReplicatedId.make(id),
      block,
      after,
      text: value,
      marks: [],
    })

    it('keeps text typed into a block joined since, where that block went', () => {
      const { gone, second, def } = joined()
      const late = insert('late:0', second, Replicated.CharRef.make(`${def}.0`), 'Q')
      expect(texts(Replicated.applyOps(gone, [late]))).toEqual(['abcQ'])
    })

    it('splits at the end when the character it split after is gone, keeping what follows', () => {
      const { gone, second, def } = joined()
      const into = ReplicatedId.make('late:1')
      const next = Replicated.applyOps(gone, [
        { type: 'Split', block: second, after: Replicated.CharRef.make(`${def}.1`), into },
        insert('late:2', into, null, 'W'),
      ])
      expect(texts(next)).toEqual(['abc', 'W'])
    })

    it('finds a joined block’s start when the character it followed was collected', () => {
      const { start, second } = joined()
      const first = idAt(start, [0])
      const abc = ReplicatedId.make(keyAt(start, [0]))
      const gone = Replicated.applyOps(start, [
        { type: 'Join', into: first, removed: second, after: charAt(start, [0], 2) },
        { type: 'Delete', ranges: [{ id: abc, from: 1, to: 3 }] },
        COLLECT,
        COLLECT,
      ])
      // `c`, the joined block's anchor, is kept only as a marker; `b` is gone for good.
      expect(texts(Replicated.applyOps(gone, [insert('late:3', second, null, 'Z')]))).toEqual([
        'aZdef',
      ])
    })
  })

  it('places a caret at a joined block’s start whose anchor was collected at the end of where it went', () => {
    const start = Replicated.fromDocument(
      decode([paragraph('p', text('a', 'abc')), paragraph('q', text('d', 'def'))]),
      'two:0',
    )
    const first = idAt(start, [0])
    const second = idAt(start, [1])
    const abc = ReplicatedId.make(keyAt(start, [0]))
    const c = charAt(start, [0], 2)
    const gone = Replicated.applyOps(start, [
      { type: 'Join', into: first, removed: second, after: c },
      // The insert carries on past `c`, so `c` is not its end and is collected outright.
      { type: 'Insert', id: abc, block: first, after: c, text: 'X', marks: [], from: 3 },
      { type: 'Delete', ranges: [{ id: abc, from: 2, to: 3 }] },
      COLLECT,
      COLLECT,
    ])
    const at = { block: second, after: null, affinity: 'after' as const }
    expect(Replicated.resolve(gone, { type: 'Range', anchor: at, focus: at })).not.toBeNull()
  })

  it('never shows a character it kept only to hold an insert’s indexes, even on undo', () => {
    const start = base()
    const id = ReplicatedId.make(keyAt(start, [4]))
    const remove: RichText.Replicated.ReplicatedOp = {
      type: 'Delete',
      ranges: [{ id, from: 2, to: 4 }],
    }
    const gone = Replicated.applyOps(Replicated.applyOps(start, [remove]), [COLLECT, COLLECT])
    const undone = Replicated.applyOps(gone, Replicated.invert(start, [remove]))
    expect(texts(undone).at(-1)).toBe('la')
  })

  it('leaves a block holding only kept characters alone', () => {
    const start = base()
    const id = ReplicatedId.make(keyAt(start, [4]))
    const block = idAt(start, [4])
    const gone = Replicated.applyOps(start, [
      { type: 'Delete', ranges: [{ id, from: 0, to: 4 }] },
      COLLECT,
      COLLECT,
    ])
    expect(Replicated.applyOps(gone, [COLLECT]).blocks[block]).toBe(gone.blocks[block])
  })

  it('takes back nothing when inverted', () => {
    expect(Replicated.invert(base(), [COLLECT])).toEqual([])
  })

  it.each([5, 23, 61])('leaves concurrent sessions editable across collections (seed %i)', seed => {
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
    // B was offline across two collections: its anchors on what A deleted are gone.
    const merged = Replicated.applyOps(start, [...opsA, COLLECT, COLLECT, ...opsB])
    const projected = Replicated.project(merged)
    expect(RichText.decodeDocument(projected)).toEqual(projected)
    const view: View = { state: merged, selection: null }
    for (let step = 0; step < 10; step++) randomEdit(view, random)
  })
})
