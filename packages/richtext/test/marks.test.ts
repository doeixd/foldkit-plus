import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const at = (node: string, offset: number, affinity: 'before' | 'after'): RichText.Position => ({
  node: id(node),
  offset,
  affinity,
})
const document = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [
        { type: 'Text', id: 'a', text: 'ab', marks: [] },
        { type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] },
        { type: 'Text', id: 'c', text: 'ef', marks: ['Code'] },
        { type: 'Text', id: 'd', text: 'gh', marks: [] },
      ],
    },
  ],
})

describe('mark definitions', () => {
  it('declares boundary expansion per mark', () => {
    expect(RichText.Bold).toEqual({ name: 'Bold', expand: 'after' })
    expect(RichText.Italic).toEqual({ name: 'Italic', expand: 'after' })
    expect(RichText.Code).toEqual({ name: 'Code', expand: 'none' })
  })

  it('compares mark sets without regard to order', () => {
    expect(RichText.sameMarkSet(['Bold', 'Italic'], ['Italic', 'Bold'])).toBe(true)
    expect(RichText.sameMarkSet(['Bold'], ['Bold', 'Italic'])).toBe(false)
    expect(RichText.sameMarkSet([], [])).toBe(true)
  })
})

describe('mark registries', () => {
  it('declares a mark with a default policy, and refuses an empty name', () => {
    expect(RichText.mark('Link', 'none')).toEqual({ name: 'Link', expand: 'none' })
    expect(RichText.mark('Highlight')).toEqual({ name: 'Highlight', expand: 'both' })
    expect(() => RichText.mark('')).toThrow()
    expect(RichText.shippedMarks).toEqual([RichText.Bold, RichText.Italic, RichText.Code])
  })

  it('reports a policy per name, defaulting to both for what it does not declare', () => {
    const registry = RichText.markRegistry([RichText.mark('Link', 'none'), RichText.Bold])
    expect(registry.expansionOf('Link')).toBe('none')
    expect(registry.expansionOf('Bold')).toBe('after')
    expect(registry.expansionOf('Highlight')).toBe('both')
  })

  it('lets a registry change how a boundary insertion behaves', () => {
    // Code does not expand at all by default, so typing at its end moves out.
    expect(RichText.resolveInsertion(document, at('c', 2, 'after'))).toEqual(at('d', 0, 'after'))
    // A registry that says Code continues makes the same position stay put.
    const codeContinues = RichText.markRegistry([RichText.mark('Code', 'both')])
    const edge = at('c', 2, 'after')
    expect(RichText.resolveInsertion(document, edge, codeContinues)).toBe(edge)

    // A mark that stops expanding moves typing out instead, when the neighbor
    // carries exactly the marks that remain.
    const boldThenPlain = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] },
            { type: 'Text', id: 'plain', text: 'gh', marks: [] },
          ],
        },
      ],
    })
    const boldEnd = at('b', 2, 'after')
    expect(RichText.resolveInsertion(boldThenPlain, boldEnd)).toBe(boldEnd)
    expect(
      RichText.resolveInsertion(
        boldThenPlain,
        boldEnd,
        RichText.markRegistry([RichText.mark('Bold', 'none')]),
      ),
    ).toEqual(at('plain', 0, 'after'))
  })

  it('carries the policy into a command, so an editor can tune its own vocabulary', () => {
    const state: RichText.EditorState = {
      document,
      selection: { type: 'Range', anchor: at('c', 2, 'after'), focus: at('c', 2, 'after') },
    }
    const ids = { mint: () => 'new' }
    // Default: typing at the end of a code run lands at the start of the plain
    // run after it.
    const byDefault = RichText.run(state, { type: 'InsertText', text: '!' }, ids)
    if (!byDefault.ok) throw new Error(byDefault.error)
    expect(byDefault.state.document.children[0]?.children.map(run => run.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
    expect(byDefault.state.document.children[0]?.children[3]?.text).toBe('!gh')

    // With the Kit's policy, it stays in the code run.
    const tuned = RichText.run(state, { type: 'InsertText', text: '!' }, ids, {
      marks: RichText.markRegistry([RichText.mark('Code', 'both')]),
    })
    if (!tuned.ok) throw new Error(tuned.error)
    expect(tuned.state.document.children[0]?.children[2]?.text).toBe('ef!')
  })
})

describe('resolveInsertion', () => {
  it('returns interior positions by reference', () => {
    const middle = at('b', 1, 'after')
    expect(RichText.resolveInsertion(document, middle)).toBe(middle)
    const wrongAffinity = at('b', 2, 'before')
    expect(RichText.resolveInsertion(document, wrongAffinity)).toBe(wrongAffinity)
  })

  it('keeps bold typing bold but drops code at the right edge', () => {
    const boldEnd = at('b', 2, 'after')
    expect(RichText.resolveInsertion(document, boldEnd)).toBe(boldEnd)
    expect(RichText.resolveInsertion(document, at('c', 2, 'after'))).toEqual(at('d', 0, 'after'))
  })

  it('moves plain typing off a bold start and keeps code starts', () => {
    expect(RichText.resolveInsertion(document, at('b', 0, 'before'))).toEqual(at('a', 2, 'before'))
    const codeStart = at('c', 0, 'before')
    expect(RichText.resolveInsertion(document, codeStart)).toBe(codeStart)
  })

  it('stays put at block edges and on unknown nodes', () => {
    const docStart = at('a', 0, 'before')
    expect(RichText.resolveInsertion(document, docStart)).toBe(docStart)
    const docEnd = at('d', 2, 'after')
    expect(RichText.resolveInsertion(document, docEnd)).toBe(docEnd)
    const missing = at('missing', 0, 'after')
    expect(RichText.resolveInsertion(document, missing)).toBe(missing)
  })

  it('refuses to swap marks at mixed edges', () => {
    const mixed = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 'x', text: 'ab', marks: ['Bold', 'Code'] },
            { type: 'Text', id: 'y', text: 'cd', marks: ['Italic'] },
          ],
        },
      ],
    })
    const edge = at('x', 2, 'after')
    expect(RichText.resolveInsertion(mixed, edge)).toBe(edge)
  })

  it('treats unknown marks as edge-preserving', () => {
    const future = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 'x', text: 'ab', marks: ['Highlight'] },
            { type: 'Text', id: 'y', text: 'cd', marks: [] },
          ],
        },
      ],
    })
    const edge = at('x', 2, 'after')
    expect(RichText.resolveInsertion(future, edge)).toBe(edge)
    expect(RichText.findUnknownMarks(future)).toEqual([{ node: 'x', mark: 'Highlight' }])
  })
})
