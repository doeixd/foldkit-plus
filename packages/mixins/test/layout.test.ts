/**
 * Layout pieces: each compiles to fixed rule text that reads `--fk-l-*`
 * variables, options only write those variables inline, and the two
 * structural exceptions (split's breakpoint, stack's split index) are the
 * only things that change a class.
 */
import { describe, expect, it } from 'vitest'
import { Layers, Style, type StyleValue } from '../src/index.js'
import { Layout } from '../src/layout.js'
import * as Rules from '../src/styleRules.js'

const cssOf = (piece: StyleValue) => Style.stylesheet(piece)
const classOf = (piece: StyleValue) => Rules.className(piece.rules ?? [])

describe('Layout', () => {
  it('stack: one class for any gap; the gap is an inline variable', () => {
    const gaps = Array.from({ length: 10 }, (_, index) => `${index}rem`)
    const stacks = gaps.map(gap => Layout.stack({ gap }))
    const sheets = new Set(stacks.map(cssOf))
    expect(sheets.size).toBe(1)
    expect(stacks.map(stack => stack.style['--fk-l-gap'])).toEqual(gaps)
    expect(Layout.stack().style).toEqual({})
  })

  it('stack: children are full width except an intrinsic one', () => {
    const intrinsic = classOf(Layout.intrinsic)
    const css = cssOf(Layout.stack())
    expect(css).toContain(
      `.${classOf(Layout.stack())}{align-items:var(--fk-l-align, stretch);display:flex;flex-direction:column;gap:var(--fk-l-gap, var(--fk-space-md, 1rem))}`,
    )
    expect(css).toContain(`> :not(.${intrinsic}){inline-size:100%;margin-block:0}`)
    expect(cssOf(Layout.intrinsic)).toBe(
      `.${intrinsic}{align-self:var(--fk-l-intrinsic-align, flex-start);flex-grow:0;inline-size:fit-content;max-inline-size:max-content}`,
    )
  })

  it('stack: the split index is structural', () => {
    expect(classOf(Layout.stack({ split: 2 }))).not.toBe(classOf(Layout.stack()))
    expect(cssOf(Layout.stack({ split: 2 }))).toContain('> :nth-child(2){margin-block-end:auto}')
    expect(Layout.stack({ align: 'center' }).style).toEqual({ '--fk-l-align': 'center' })
  })

  it('cluster', () => {
    const piece = Layout.cluster({ gap: '2px', justify: 'end', align: 'start' })
    expect(cssOf(piece)).toBe(
      `.${classOf(piece)}{align-items:var(--fk-l-align, center);display:flex;flex-wrap:wrap;gap:var(--fk-l-gap, var(--fk-space-sm, 0.75rem));justify-content:var(--fk-l-justify, flex-start)}`,
    )
    expect(piece.style).toEqual({
      '--fk-l-gap': '2px',
      '--fk-l-justify': 'end',
      '--fk-l-align': 'start',
    })
  })

  it('split: a container query by default, a media query with contain: false', () => {
    const contained = Layout.split({ fraction: '1fr 2fr' })
    expect(cssOf(contained)).toBe(
      `.${classOf(contained)}{display:grid;gap:var(--fk-l-gap, var(--fk-space-md, 1rem));grid-template-columns:1fr}` +
        `.${classOf(contained)}{container-type:inline-size}` +
        `@container (min-width: 30rem){.${classOf(contained)}{grid-template-columns:var(--fk-l-fraction, 1fr 1fr)}}`,
    )
    expect(contained.style).toEqual({ '--fk-l-fraction': '1fr 2fr' })
    const viewport = Layout.split({ contain: false, breakpoint: '40rem' })
    expect(cssOf(viewport)).not.toContain('container')
    expect(cssOf(viewport)).toContain(
      `@media (min-width: 40rem){.${classOf(viewport)}{grid-template-columns:var(--fk-l-fraction, 1fr 1fr)}}`,
    )
    expect(classOf(Layout.split({ breakpoint: '40rem' }))).not.toBe(classOf(contained))
  })

  it('sidebar: content and aside are told apart by the aside class', () => {
    const aside = classOf(Layout.aside)
    const start = Layout.sidebar({ width: '15rem', contentMin: '60%' })
    const css = cssOf(start)
    expect(css).toContain(
      `> :not(.${aside}){flex-basis:var(--fk-l-content-min, 50%);flex-grow:9999}`,
    )
    expect(css).not.toContain('order')
    expect(start.style).toEqual({ '--fk-l-side-width': '15rem', '--fk-l-content-min': '60%' })
    expect(cssOf(Layout.aside)).toBe(
      `.${aside}{flex-basis:var(--fk-l-side-width, 20rem);flex-grow:1}`,
    )
    expect(cssOf(Layout.sidebar({ side: 'end' }))).toContain(`> .${aside}{order:1}`)
  })

  it('switcher, reel, center, frame, pad, autoGrid', () => {
    expect(cssOf(Layout.switcher())).toContain(
      '> *{flex-basis:calc((var(--fk-l-threshold, 30rem) - 100%) * 999);flex-grow:1}',
    )
    expect(Layout.switcher({ threshold: '20rem' }).style).toEqual({ '--fk-l-threshold': '20rem' })

    const reel = Layout.reel({ snap: true, scrollbar: 'hidden', itemSize: '10rem' })
    const reelCss = cssOf(reel)
    expect(reelCss).toContain('scroll-snap-type:inline proximity')
    expect(reelCss).toContain('> *{scroll-snap-align:start}')
    expect(reelCss).toContain(`.${classOf(reel)}::-webkit-scrollbar{display:none}`)
    expect(reel.style).toEqual({ '--fk-l-item-size': '10rem' })
    expect(cssOf(Layout.reel({ scrollbar: 'thin' }))).toContain('scrollbar-width:thin')
    expect(cssOf(Layout.reel())).not.toContain('scrollbar-width')

    expect(cssOf(Layout.center({ intrinsic: true }))).toContain('align-items:center;display:flex')
    expect(Layout.center({ max: '40rem', gutters: '0' }).style).toEqual({
      '--fk-l-max': '40rem',
      '--fk-l-gutters': '0',
    })

    expect(cssOf(Layout.frame())).toContain(
      '> :is(img, video){block-size:100%;inline-size:100%;inset:0;object-fit:cover;position:absolute}',
    )
    expect(Layout.frame({ ratio: '1' }).style).toEqual({ '--fk-l-ratio': '1' })

    expect(Layout.pad({ inline: '1rem', block: '2rem' }).style).toEqual({
      '--fk-l-pad-inline': '1rem',
      '--fk-l-pad-block': '2rem',
    })

    expect(cssOf(Layout.autoGrid())).toContain(
      'grid-template-columns:repeat(auto-fit, minmax(min(100%, var(--fk-l-min-item-size, 16rem)), 1fr))',
    )
    expect(Layout.autoGrid({ minItemSize: '12rem' }).style).toEqual({
      '--fk-l-min-item-size': '12rem',
    })
  })

  it('a page layers the pieces itself', () => {
    const L = Layers.standard
    const sheet = Style.stylesheet(L.declare, L.in('layouts', Layout.stack()))
    expect(
      sheet.startsWith(
        '@layer reset, tokens, theme, defaults, components, layouts, variants, utilities, app;',
      ),
    ).toBe(true)
    expect(sheet).toContain('@layer layouts{.style-')
  })
})
