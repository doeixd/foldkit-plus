/**
 * What one keystroke, and one large paste, cost in a replicated document.
 *
 * The collaborative path does four things per edit: `translate` restates the
 * editor's transaction as ops, `applyOps` applies them, and `project` and
 * `resolve` hand the result back to the editor. Each case types into the middle
 * paragraph of a document of `n` paragraphs, starting from the same state.
 */
import { describe, test } from 'vitest'
import * as RichText from 'foldkit-richtext'

const { Replicated } = RichText

const benchmark = (name: string, run: () => unknown) =>
  test(name, async ({ bench }) => {
    await bench(name, run).run()
  })

const document = (paragraphs: number): RichText.Document =>
  RichText.decodeDocument({
    version: 1,
    children: Array.from({ length: paragraphs }, (_, index) => ({
      type: 'Paragraph' as const,
      id: `p${index}`,
      children: [{ type: 'Text' as const, id: `t${index}`, text: 'a line of text', marks: [] }],
    })),
  })

/** A replicated document, and the editor's view of it with a caret in the middle paragraph. */
const scene = (paragraphs: number) => {
  const state = Replicated.fromDocument(document(paragraphs), 'seed')
  const projected = Replicated.project(state)
  const run = projected.children[Math.floor(paragraphs / 2)]!.children[0]!.id
  const at = { node: run, offset: 7, affinity: 'after' as const }
  const selection: RichText.Selection = { type: 'Range', anchor: at, focus: at }
  return { state, projected, selection }
}

let keys = 0
const keystroke = ({ state, projected, selection }: ReturnType<typeof scene>) => {
  const edit = RichText.run(
    { document: projected, selection },
    { type: 'InsertText', text: 'x' },
    { mint: () => 'unused' },
  )
  if (!edit.ok) throw new Error(edit.error)
  const translated = Replicated.translate(state, edit, `bench:${keys++}`)
  const next = Replicated.applyOps(state, translated.ops)
  Replicated.project(next)
  Replicated.resolve(next, translated.selection)
  return translated.ops
}

describe.each([100, 1000, 4000])('%i paragraphs', paragraphs => {
  const typing = scene(paragraphs)
  const ops = keystroke(typing)

  benchmark(`type one character (${paragraphs})`, () => keystroke(typing))

  benchmark(`apply one insert (${paragraphs})`, () =>
    // A copy of the ops, so the per-(state, ops) memo cannot answer.
    Replicated.applyOps(typing.state, [...ops]),
  )

  benchmark(`project after one insert (${paragraphs})`, () =>
    Replicated.project(Replicated.applyOps(typing.state, [...ops])),
  )
})

/**
 * A paste of `n` paragraphs at the end of the middle paragraph of a 100-paragraph document:
 * the command, its translation, and applying the ops. Each pasted block is its own
 * `InsertNode`, so any per-block cost that grows with the blocks before it shows here.
 */
describe.each([500, 2000])('a paste of %i paragraphs', blocks => {
  const { state, projected } = scene(100)
  const run = projected.children[50]!.children[0]!
  const at = { node: run.id, offset: run.text.length, affinity: 'after' as const }
  const selection: RichText.Selection = { type: 'Range', anchor: at, focus: at }
  const slice = { version: 1 as const, blocks: document(blocks).children }
  let minted = 0
  const paste = () =>
    RichText.run(
      { document: projected, selection },
      { type: 'Paste', slice },
      { mint: () => `m${minted++}` },
    )
  const edit = paste()
  if (!edit.ok) throw new Error(edit.error)
  const { ops } = Replicated.translate(state, edit, 'paste:0')

  benchmark(`run the paste (${blocks})`, paste)
  benchmark(`translate the paste (${blocks})`, () =>
    Replicated.translate(state, edit, `paste:${keys++}`),
  )
  benchmark(`apply the paste's ops (${blocks})`, () => Replicated.applyOps(state, [...ops]))
})
