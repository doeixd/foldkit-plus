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
