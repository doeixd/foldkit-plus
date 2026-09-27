/**
 * What one keystroke costs in a replicated document, by document size.
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
