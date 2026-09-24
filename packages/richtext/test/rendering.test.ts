import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const text = (id: string, value: string, marks: ReadonlyArray<RichText.RunMark> = []) =>
  ({ type: 'Text', id, text: value, marks }) as const

const paragraph = (runs: ReadonlyArray<unknown>) =>
  ({ type: 'Paragraph', id: 'p', children: runs }) as const

const node = (kind: string, props: Record<string, unknown>, runs: ReadonlyArray<unknown>) =>
  ({ type: 'Node', kind, id: 'n', props, children: runs }) as const

const decode = (children: ReadonlyArray<unknown>) =>
  RichText.decodeDocument({ version: 1, children } as never)

const link = (href: string): RichText.RunMark => ({ name: 'Link', props: { href } })

const links = RichText.rendering({
  marks: {
    Link: mark => ({
      tag: 'a',
      attributes: { href: String(RichText.markProps(mark)?.href ?? '') },
    }),
  },
})

describe('rendering a declared mark', () => {
  it('gives a mark with props its own element and attributes', () => {
    const document = decode([
      paragraph([text('a', 'docs', [link('https://example.test/x?a=1&b=2')])]),
    ])
    expect(RichText.documentToHtml(document, links)).toBe(
      '<p><a href="https://example.test/x?a=1&amp;b=2">docs</a></p>',
    )
  })

  it('nests a built-in inside an entry, whatever order the marks are stored in', () => {
    const sorted = decode([paragraph([text('a', 'x', ['Bold', link('/a')])])])
    const reversed = decode([paragraph([text('a', 'x', [link('/a'), 'Bold'])])])
    const expected = '<p><a href="/a"><strong>x</strong></a></p>'
    expect(RichText.documentToHtml(sorted, links)).toBe(expected)
    expect(RichText.documentToHtml(reversed, links)).toBe(expected)
  })

  it('orders entries alphabetically and data-marks names stably', () => {
    const renderer = RichText.rendering({
      marks: {
        Link: mark => ({
          tag: 'a',
          attributes: { href: String(RichText.markProps(mark)?.href ?? '') },
        }),
        Highlight: () => ({ tag: 'mark', attributes: {} }),
      },
    })
    const document = decode([
      paragraph([text('a', 'x', [link('/a'), 'Highlight', 'Zeta', 'Alpha'])]),
    ])
    expect(RichText.documentToHtml(document, renderer)).toBe(
      '<p><span data-marks="Alpha Zeta"><a href="/a"><mark>x</mark></a></span></p>',
    )
  })

  it('replaces a shipped tag when the renderer has an entry for that name', () => {
    const renderer = RichText.rendering({
      marks: { Bold: { tag: 'b', attributes: { 'data-strong': '' } } },
    })
    const document = decode([paragraph([text('a', 'x', ['Bold'])])])
    expect(RichText.documentToHtml(document, renderer)).toBe('<p><b data-strong="">x</b></p>')
  })

  it('falls back by name when an entry declines, and when there is none', () => {
    const declining = RichText.rendering({ marks: { Highlight: () => undefined } })
    const document = decode([paragraph([text('a', 'x', ['Highlight', 'Unknown'])])])
    for (const renderer of [declining, RichText.noRendering]) {
      expect(RichText.documentToHtml(document, renderer)).toBe(
        '<p><span data-marks="Highlight Unknown">x</span></p>',
      )
    }
  })
})

describe('rendering a declared node kind', () => {
  it('replaces the default element, with attributes from the node props', () => {
    const renderer = RichText.rendering({
      nodes: {
        Callout: block => ({
          tag: 'aside',
          attributes: { 'data-tone': String(block.props.tone ?? '') },
        }),
      },
    })
    const document = decode([node('Callout', { tone: 'warn' }, [text('a', 'x')])])
    expect(RichText.documentToHtml(document, renderer)).toBe('<aside data-tone="warn">x</aside>')
  })

  it('keeps the default element for a kind with no entry, or one that declines', () => {
    const declining = RichText.rendering({ nodes: { Callout: () => undefined } })
    const document = decode([node('Callout', {}, [text('a', 'x')])])
    for (const renderer of [declining, RichText.noRendering]) {
      expect(RichText.documentToHtml(document, renderer)).toBe('<div data-node="Callout">x</div>')
    }
  })
})

describe('a renderer as a boundary', () => {
  it('refuses a tag or attribute name that would end the markup', () => {
    const breakout = RichText.rendering({
      marks: {
        Link: mark => ({
          tag: 'a',
          attributes: {
            [`href="/x" onclick="${String(RichText.markProps(mark)?.href ?? '')}"`]: 'y',
          },
        }),
      },
    })
    const document = decode([paragraph([text('a', 'x', [link('alert(1)')])])])
    expect(() => RichText.documentToHtml(document, breakout)).toThrow(/invalid attribute name/)
    expect(() =>
      RichText.documentToHtml(
        document,
        RichText.rendering({ marks: { Link: { tag: 'a b', attributes: {} } } }),
      ),
    ).toThrow(/invalid tag/)
  })

  it('never reads a prototype for a content-chosen name, even hand-built', () => {
    // A `Rendering` is an interface, so a caller may build one without the
    // constructor; an own-property lookup is what keeps `__proto__` out of it.
    const handmade: RichText.Rendering = {
      marks: { Bold: { tag: 'b', attributes: {} } },
      nodes: {},
    }
    const document = decode([paragraph([text('a', 'x', ['__proto__', 'Bold'])])])
    expect(RichText.documentToHtml(document, handmade)).toBe(
      '<p><span data-marks="__proto__"><b>x</b></span></p>',
    )
  })
})
