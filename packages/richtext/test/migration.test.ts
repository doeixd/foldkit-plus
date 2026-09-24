import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const Tone = Schema.Struct({ tone: Schema.Literals(['info', 'warning', 'critical']) })

const preserved = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      { type: 'Embed', id: 'e', tone: 'critical', caption: 'kept' },
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 't', text: 'text', marks: [] }],
      },
    ],
  })
const legacyCallout = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Node',
        kind: 'Callout',
        id: 'c',
        props: { tone: 'danger' },
        children: [{ type: 'Text', id: 'ct', text: 'Careful', marks: [] }],
      },
    ],
  })

describe('migrations', () => {
  it('promotes a preserved unknown block into a declared kind, keeping its identity', () => {
    const document = preserved()
    const report = RichText.migrate(document, [
      RichText.promoteUnknown('EmbedToCallout', 'Embed', 'Callout', Tone),
    ])
    expect(report.applied).toEqual([{ name: 'EmbedToCallout', node: 'e' }])
    expect(report.unused).toEqual([])
    expect(report.document.children[0]).toEqual({
      type: 'Node',
      kind: 'Callout',
      id: 'e',
      props: { tone: 'critical' },
      children: [],
    })
    // The block that was not this migration's shape is untouched, by identity.
    expect(report.document.children[1]).toBe(document.children[1])
  })

  it('declines a block whose data does not decode, rather than half-converting it', () => {
    const wrong = RichText.decodeDocument({
      version: 1,
      children: [{ type: 'Embed', id: 'e', tone: 'loud' }],
    })
    const report = RichText.migrate(wrong, [
      RichText.promoteUnknown('EmbedToCallout', 'Embed', 'Callout', Tone),
    ])
    expect(report.applied).toEqual([])
    expect(report.unused).toEqual(['EmbedToCallout'])
    expect(report.document.children[0]?.type).toBe('Unknown')
  })

  it('retypes a node’s props in place', () => {
    const report = RichText.migrate(legacyCallout(), [
      RichText.migration('DangerToCritical', 'Callout', block =>
        block.type === 'Node' && block.props.tone === 'danger'
          ? { ...block, props: { ...block.props, tone: 'critical' } }
          : undefined,
      ),
    ])
    expect(report.applied).toEqual([{ name: 'DangerToCritical', node: 'c' }])
    expect(report.document.children[0]).toEqual({
      type: 'Node',
      kind: 'Callout',
      id: 'c',
      props: { tone: 'critical' },
      children: [{ type: 'Text', id: 'ct', text: 'Careful', marks: [] }],
    })
  })

  it('runs migrations in order, so a chain sees what the one before produced', () => {
    const report = RichText.migrate(preserved(), [
      RichText.promoteUnknown('EmbedToCallout', 'Embed', 'Callout', Tone),
      RichText.migration('CalloutToNote', 'Callout', block =>
        block.type === 'Node' ? { ...block, kind: 'Note' } : undefined,
      ),
    ])
    expect(report.applied.map(entry => entry.name)).toEqual(['EmbedToCallout', 'CalloutToNote'])
    expect(report.document.children[0]?.type === 'Node' && report.document.children[0].kind).toBe(
      'Note',
    )
    // Reversing the order would have left the block preserved, which is why the
    // list order is the chain.
    const reversed = RichText.migrate(preserved(), [
      RichText.migration('CalloutToNote', 'Callout', block =>
        block.type === 'Node' ? { ...block, kind: 'Note' } : undefined,
      ),
      RichText.promoteUnknown('EmbedToCallout', 'Embed', 'Callout', Tone),
    ])
    expect(reversed.applied.map(entry => entry.name)).toEqual(['EmbedToCallout'])
  })

  it('leaves a document with no matching block alone, by identity', () => {
    const document = RichText.decodeDocument({ version: 1, children: [] })
    const report = RichText.migrate(document, [
      RichText.promoteUnknown('EmbedToCallout', 'Embed', 'Callout', Tone),
    ])
    expect(report.document).toBe(document)
    expect(report.applied).toEqual([])
    expect(report.unused).toEqual(['EmbedToCallout'])
  })

  it('refuses a migration that changes identity instead of breaking references', () => {
    expect(() =>
      RichText.migrate(legacyCallout(), [
        RichText.migration('Renames', 'Callout', block => ({ ...block, id: id('other') })),
      ]),
    ).toThrow(/changed a block's identity/)
  })

  it('refuses a migration that would write content the codec cannot store', () => {
    expect(() =>
      RichText.migrate(preserved(), [
        RichText.migration('BadProps', 'Embed', block =>
          block.type === 'Unknown'
            ? {
                type: 'Node',
                kind: 'Callout',
                id: block.id,
                // A function is not JSON: persisted content must stay data.
                props: { load: () => 1 } as never,
                children: [],
              }
            : undefined,
        ),
      ]),
    ).toThrow(/produced an invalid block/)
  })

  it('refuses duplicate identities introduced across blocks', () => {
    const document = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'first',
          children: [{ type: 'Text', id: 'a', text: '', marks: [] }],
        },
        {
          type: 'Paragraph',
          id: 'second',
          children: [{ type: 'Text', id: 'b', text: '', marks: [] }],
        },
      ],
    })
    for (const duplicate of ['a', 'first', 'second']) {
      expect(() =>
        RichText.migrate(document, [
          RichText.migration('Collides', 'Paragraph', block =>
            block.id === id('second')
              ? { ...block, children: [{ ...block.children[0]!, id: id(duplicate) }] }
              : undefined,
          ),
        ]),
      ).toThrow(/Migration "Collides" produced an invalid document/)
    }
  })

  it('checks a migration at construction', () => {
    expect(() => RichText.migration('', 'Embed', () => undefined)).toThrow()
    expect(() => RichText.migration('Name', '', () => undefined)).toThrow()
  })
})

describe('migrations inside a container', () => {
  const nested = () =>
    RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'List',
          id: 'list',
          props: {},
          children: [],
          blocks: [
            { type: 'Embed', id: 'e', tone: 'critical' },
            {
              type: 'Paragraph',
              id: 'p',
              children: [{ type: 'Text', id: 't', text: 'text', marks: [] }],
            },
          ],
        },
        { type: 'Embed', id: 'top', tone: 'warning' },
      ],
    })

  it('rewrites a nested block where it sits, leaving the container in place', () => {
    const report = RichText.migrate(nested(), [
      RichText.promoteUnknown('EmbedToCallout', 'Embed', 'Callout', Tone),
    ])
    // Both the nested and the top-level preserved block are promoted.
    expect(report.applied).toEqual([
      { name: 'EmbedToCallout', node: 'e' },
      { name: 'EmbedToCallout', node: 'top' },
    ])
    const list = report.document.children[0]
    if (list?.type !== 'Node') throw new Error('expected a container')
    expect(list.blocks?.[0]).toMatchObject({ type: 'Node', kind: 'Callout', id: 'e' })
    expect(list.blocks?.[1]).toMatchObject({ type: 'Paragraph', id: 'p' })
    expect(report.document.children[1]).toMatchObject({ id: 'top', kind: 'Callout' })
    expect(
      RichText.validate(
        report.document,
        RichText.kit({
          nodes: [
            RichText.node('List', { children: RichText.blockContent }),
            RichText.node('Callout', { Props: Tone }),
            RichText.block('Paragraph'),
          ],
          marks: [],
        }),
      ),
    ).toEqual([])
  })

  it('promotes into a container kind when the target holds blocks', () => {
    const document = RichText.decodeDocument({
      version: 1,
      children: [{ type: 'Embed', id: 'e', tone: 'critical' }],
    })
    const asContainer = RichText.migrate(document, [
      RichText.promoteUnknown('EmbedToCallout', 'Embed', 'Callout', Tone, RichText.blockContent),
    ])
    expect(asContainer.document.children[0]).toEqual({
      type: 'Node',
      kind: 'Callout',
      id: 'e',
      props: { tone: 'critical' },
      children: [],
      blocks: [],
    })
    // The default target holds runs, so it has no nested blocks.
    const asRuns = RichText.migrate(document, [
      RichText.promoteUnknown('EmbedToCallout', 'Embed', 'Callout', Tone),
    ])
    expect(asRuns.document.children[0]).toMatchObject({ children: [] })
    expect((asRuns.document.children[0] as { blocks?: unknown }).blocks).toBeUndefined()
  })

  it('refuses a migration that changes a nested block\\u2019s identity', () => {
    expect(() =>
      RichText.migrate(nested(), [
        RichText.migration('Renames', 'Embed', block => ({ ...block, id: id('other') })),
      ]),
    ).toThrow(/changed a block's identity/)
  })

  it('reports a migration as unused when nothing matches, nested or not', () => {
    const document = nested()
    const report = RichText.migrate(document, [
      RichText.migration('Nothing', 'Heading', block => block),
    ])
    expect(report.unused).toEqual(['Nothing'])
    expect(report.applied).toEqual([])
    // Nothing changed, so the document is the one that went in.
    expect(report.document).toBe(document)
  })
})
