import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

/**
 * Regressions from the implementation review: a Kit's declaration is a
 * constraint, prop validation is strict, and a node definition keeps the
 * caller's types.
 */
const Tone = Schema.Struct({ tone: Schema.Literals(['info', 'warning']) })
const Callout = RichText.node('Callout', { Props: Tone })

const paragraph = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 't', text: 'hi', marks: [] }],
      },
    ],
  })
const callout = (props: Record<string, unknown>) =>
  RichText.decodeDocument({
    version: 1,
    children: [{ type: 'Node', kind: 'Callout', id: 'c', props, children: [] }],
  })

describe('a declaration is a constraint', () => {
  it('reports a name declared with a kind the document does not hold', () => {
    // The review's case: a Paragraph validated against an atom declaration.
    const atomParagraph = RichText.kit({ nodes: [RichText.atom('Paragraph')], marks: [] })
    expect(RichText.validate(paragraph(), atomParagraph)).toEqual([
      {
        code: 'MismatchedDefinition',
        node: 'p',
        detail: 'Paragraph',
        message: '"Paragraph" is declared as atom, but the document holds it as block',
      },
    ])
  })

  it('accepts a declaration that agrees with the document', () => {
    const declared = RichText.kit({
      nodes: [RichText.block('Paragraph'), Callout],
      marks: [],
    })
    expect(RichText.validate(paragraph(), declared)).toEqual([])
    expect(RichText.validate(callout({ tone: 'info' }), declared)).toEqual([])
  })

  it('reports an atom declaration only when the node actually holds content', () => {
    const asAtom = RichText.kit({ nodes: [RichText.atom('Callout')], marks: [] })
    // An empty application node is exactly what an atom looks like in a
    // document, so it agrees; one holding runs does not.
    expect(RichText.validate(callout({ tone: 'info' }), asAtom)).toEqual([])
    const holding = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Callout',
          id: 'c',
          props: { tone: 'info' },
          children: [{ type: 'Text', id: 't', text: 'x', marks: [] }],
        },
      ],
    })
    expect(RichText.validate(holding, asAtom)).toEqual([
      {
        code: 'MismatchedDefinition',
        node: 'c',
        detail: 'Callout',
        message: '"Callout" is declared to hold none, but the document holds text',
      },
    ])
  })

  it('reports a content mode the document contradicts', () => {
    const List = RichText.node('List', { children: RichText.blockContent })
    const listKit = RichText.kit({
      nodes: [List, RichText.block('Paragraph')],
      marks: [],
    })
    const asRuns = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'List',
          id: 'l',
          props: {},
          children: [{ type: 'Text', id: 't', text: 'x', marks: [] }],
        },
      ],
    })
    expect(RichText.validate(asRuns, listKit)).toEqual([
      {
        code: 'MismatchedDefinition',
        node: 'l',
        detail: 'List',
        message: '"List" is declared to hold blocks, but the document holds text',
      },
    ])
    const asBlocks = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'List',
          id: 'l',
          props: {},
          children: [],
          blocks: [{ type: 'Paragraph', id: 'p', children: [] }],
        },
      ],
    })
    expect(RichText.validate(asBlocks, listKit)).toEqual([])
    // A declaration that holds runs refuses a container.
    const containerCallout = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Callout',
          id: 'c',
          props: { tone: 'info' },
          children: [],
          blocks: [{ type: 'Paragraph', id: 'p', children: [] }],
        },
      ],
    })
    expect(
      RichText.validate(
        containerCallout,
        RichText.kit({ nodes: [Callout, RichText.block('Paragraph')], marks: [] }),
      ).map(diagnostic => diagnostic.code),
    ).toEqual(['MismatchedDefinition'])
  })

  it('checks nested blocks and their marks, not only the top level', () => {
    const List = RichText.node('List', { children: RichText.blockContent })
    const listKit = RichText.kit({ nodes: [List], marks: [] })
    const nested = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'List',
          id: 'l',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Paragraph',
              id: 'p',
              children: [{ type: 'Text', id: 't', text: 'x', marks: ['Highlight'] }],
            },
            { type: 'Embed', id: 'e', src: 'x' },
          ],
        },
      ],
    })
    expect(RichText.validate(nested, listKit).map(diagnostic => diagnostic.code)).toEqual([
      'UnsupportedNode',
      'UnknownMark',
      'UnknownNode',
    ])
  })
})

describe('prop validation is strict', () => {
  it('rejects a field the declared schema does not name', () => {
    const declared = RichText.kit({ nodes: [Callout], marks: [] })
    expect(RichText.validate(callout({ tone: 'info', extra: 'retained' }), declared)).toEqual([
      {
        code: 'InvalidProps',
        node: 'c',
        detail: 'Callout',
        message: '"Callout" props do not match its declared schema',
      },
    ])
  })

  it('does not copy a schema message into the diagnostic', () => {
    const declared = RichText.kit({ nodes: [Callout], marks: [] })
    const [diagnostic] = RichText.validate(callout({ tone: 'loud' }), declared)
    // A stable verdict, not the schema's internals.
    expect(diagnostic?.message).not.toContain('loud')
    expect(diagnostic?.message).toBe('"Callout" props do not match its declared schema')
  })
})

describe('node definitions keep the caller’s types', () => {
  it('keeps the declared name and schema on the returned descriptor', () => {
    const name: 'Callout' = Callout.name
    expect(name).toBe('Callout')
    expect(Callout.props).toBe(Tone)
    // The decoded props are the schema's type, not `any`.
    const decoded = Schema.decodeUnknownSync(Callout.props)({ tone: 'info' })
    const tone: 'info' | 'warning' = decoded.tone
    expect(tone).toBe('info')
    // @ts-expect-error `tone` is a literal union, not a number.
    const wrong: number = decoded.tone
    void wrong
  })
})
