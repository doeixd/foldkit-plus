import { describe, expect, it } from 'vitest'
import { Icon } from 'foldkit-media'
import { fromIconify, namesOf, parse, type IconifySet } from 'foldkit-media/icons'

const lucideHeart = `<?xml version="1.0" encoding="UTF-8"?>
<!-- lucide -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <title>Heart</title>
  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3"/>
  <g transform="translate(1 1)"><circle cx="12" cy="12" r="3"></circle></g>
</svg>`

describe('parse', () => {
  it('keeps what the root paints and the drawing, and drops its size and words', () => {
    expect(parse(lucideHeart, 'heart')).toEqual({
      viewBox: '0 0 24 24',
      attributes: { fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
      nodes: [
        {
          tag: 'path',
          attributes: { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3' },
          children: [],
        },
        {
          tag: 'g',
          attributes: { transform: 'translate(1 1)' },
          children: [{ tag: 'circle', attributes: { cx: '12', cy: '12', r: '3' }, children: [] }],
        },
      ],
    })
  })

  it('makes a viewBox from a width and height in user units', () => {
    expect(
      parse('<svg width="20" height="10"><rect width="5" height="5"/></svg>', 'box').viewBox,
    ).toBe('0 0 20 10')
  })

  it('reads a gradient by its id, and a legacy xlink:href as href', () => {
    const icon = parse(
      `<svg viewBox="0 0 8 8"><defs><linearGradient id="a"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(#a)" width="8" height="8"/><use xlink:href='#a'/></svg>`,
      'gradient',
    )
    expect(icon.nodes[1]).toEqual({
      tag: 'rect',
      attributes: { fill: 'url(#a)', width: '8', height: '8' },
      children: [],
    })
    expect(icon.nodes[2]).toEqual({ tag: 'use', attributes: { href: '#a' }, children: [] })
  })

  it('skips a dropped element whole, nested ones and what they hold included', () => {
    const icon = parse(
      '<svg viewBox="0 0 1 1"><desc>a <title>b</title> c</desc><metadata/><path d="M0 0"/></svg>',
      'words',
    )
    expect(icon.nodes).toEqual([{ tag: 'path', attributes: { d: 'M0 0' }, children: [] }])
  })

  it.each([
    ['a script', '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>', /<script>/],
    ['a style element', '<svg viewBox="0 0 1 1"><style>*{}</style></svg>', /<style>/],
    ['a foreign object', '<svg viewBox="0 0 1 1"><foreignObject/></svg>', /<foreignObject>/],
    ['an image', '<svg viewBox="0 0 1 1"><image href="#a"/></svg>', /<image>/],
    ['an animation', '<svg viewBox="0 0 1 1"><animate attributeName="href"/></svg>', /<animate>/],
    [
      'a style attribute',
      '<svg viewBox="0 0 1 1"><path style="fill:red"/></svg>',
      /attribute style/,
    ],
    ['a class', '<svg viewBox="0 0 1 1" class="x"></svg>', /attribute class/],
    ['an event', '<svg viewBox="0 0 1 1"><path onclick="go()"/></svg>', /attribute onclick/],
    ['an event on the root', '<svg viewBox="0 0 1 1" onload="go()"></svg>', /attribute onload/],
    ['a link out', '<svg viewBox="0 0 1 1"><use href="other.svg#a"/></svg>', /links outside/],
    [
      'a javascript link',
      '<svg viewBox="0 0 1 1"><use xlink:href="javascript:go()"/></svg>',
      /links outside/,
    ],
    [
      'a fill from a file',
      '<svg viewBox="0 0 1 1"><path fill="url(paint.svg#a)"/></svg>',
      /refers outside/,
    ],
    [
      'a fill from a file in capitals',
      '<svg viewBox="0 0 1 1"><path fill="URL(https://x.test/p)"/></svg>',
      /refers outside/,
    ],
    [
      'a CSS escape',
      '<svg viewBox="0 0 1 1"><path fill="\\75 rl(https://x.test/p)"/></svg>',
      /CSS escape/,
    ],
    ['a mask from a file', `<svg viewBox="0 0 1 1" mask="url('m.svg')"></svg>`, /refers outside/],
    ['text', '<svg viewBox="0 0 1 1">hello</svg>', /text "hello"/],
    ['text before the root', 'hi<svg viewBox="0 0 1 1"></svg>', /text "hi"/],
    ['a root that is not svg', '<g></g>', /root is <g>/],
    ['no svg', '<!-- nothing -->', /no svg/],
    ['markup after the svg', '<svg viewBox="0 0 1 1"></svg><path/>', /after its svg/],
    ['an element left open', '<svg viewBox="0 0 1 1"><g></svg>', /<\/svg> closes <g>/],
    ['the svg left open', '<svg viewBox="0 0 1 1"><g></g>', /<svg> never closes/],
    ['a close of nothing', '</g>', /closes nothing/],
    ['a tag that never closes', '<svg viewBox="0 0 1 1"', /tag never closes/],
    ['a comment that never closes', '<svg viewBox="0 0 1 1"><!-- </svg>', /comment never closes/],
    ['CDATA', '<svg viewBox="0 0 1 1"><![CDATA[x]]></svg>', /CDATA/],
    [
      'a doctype with entities',
      '<!DOCTYPE svg [<!ENTITY a "b">]><svg viewBox="0 0 1 1"></svg>',
      /text "]>"/,
    ],
    ['a declaration inside', '<svg viewBox="0 0 1 1"><?x?></svg>', /declaration inside/],
    [
      'an attribute set twice',
      '<svg viewBox="0 0 1 1"><use href="#a" xlink:href="#b"/></svg>',
      /href twice/,
    ],
    ['an unquoted attribute', '<svg viewBox="0 0 1 1"><path d=M0/></svg>', /malformed/],
    [
      'an unknown entity',
      '<svg viewBox="0 0 1 1"><path d="&nbsp;"/></svg>',
      /unknown entity &nbsp;/,
    ],
    [
      'a reference to no character',
      '<svg viewBox="0 0 1 1"><path d="&#0;"/></svg>',
      /&#0;, which is no/,
    ],
    [
      'a malformed reference',
      '<svg viewBox="0 0 1 1"><path d="&#xZZ;"/></svg>',
      /&#xZZ;, which is no/,
    ],
    [
      'a reference past Unicode',
      '<svg viewBox="0 0 1 1"><path d="&#x110000;"/></svg>',
      /which is no/,
    ],
    ['no box', '<svg width="1em" height="1em"></svg>', /no viewBox/],
    [
      'a mask fetching an image',
      `<svg viewBox="0 0 1 1"><path mask="image-set('https://evil.test/x.png' 1x)"/></svg>`,
      /calls image-set/,
    ],
    [
      'an image behind a gradient',
      `<svg viewBox="0 0 1 1"><path mask="linear-gradient(red, blue), cross-fade(url(#a), red)"/></svg>`,
      /calls linear-gradient/,
    ],
    [
      'a link to an id of the page',
      '<svg viewBox="0 0 1 1"><use href="#app-logo"/></svg>',
      /names #app-logo, which the icon does not define/,
    ],
    [
      'a paint of an id of the page',
      '<svg viewBox="0 0 1 1"><path fill="url( #brand )"/></svg>',
      /names #brand, which the icon does not define/,
    ],
  ])('refuses %s, naming the icon', (_, svg, reason) => {
    expect(() => parse(svg, 'bad')).toThrow(/^The icon "bad" cannot be drawn inline/)
    expect(() => parse(svg, 'bad')).toThrow(reason)
  })
})

describe('Icon.serialize and Icon.maskUrl', () => {
  const tricky = parse(
    `<svg viewBox="0 0 4 4" fill="currentColor"><g id="a&amp;b&quot;&lt;&gt;&#x41;&#66;"><path d="M0 0"/></g><path d="M1 1"></path></svg>`,
    'tricky',
  )

  it('decode their own entities when read back', () => {
    expect(tricky.nodes[0]!.attributes['id']).toBe(`a&b"<>AB`)
    expect(parse(Icon.serialize(tricky), 'tricky')).toEqual(tricky)
  })

  it('give a mask the same document, encoded for a CSS url', () => {
    const url = Icon.maskUrl(tricky)
    const encoded = /^url\("data:image\/svg\+xml,(.*)"\)$/.exec(url)![1]!
    expect(encoded).not.toMatch(/["#<>]/)
    expect(decodeURIComponent(encoded)).toBe(Icon.serialize(tricky))
  })

  it('encode the line breaks an exported drawing keeps in its attributes, which end a CSS string', () => {
    const breaks = [10, 13, 9].map(code => String.fromCharCode(code)).join('')
    const wrapped = parse(`<svg viewBox="0 0 4 4"><path d="M0 0${breaks}L4 4"/></svg>`, 'wrapped')
    const encoded = /^url\("data:image\/svg\+xml,(.*)"\)$/s.exec(Icon.maskUrl(wrapped))![1]!
    expect([...breaks].some(each => encoded.includes(each))).toBe(false)
    expect(decodeURIComponent(encoded)).toBe(Icon.serialize(wrapped))
  })
})

describe('fromIconify', () => {
  const set: IconifySet = {
    prefix: 'test',
    height: 20,
    icons: {
      dot: { body: '<circle cx="5" cy="5" r="2"/>', width: 10 },
      plain: { body: '<path d="M0 0"/>' },
      flipped: { body: '<path d="M0 0"/>', hFlip: true },
    },
    aliases: {
      wide: { parent: 'dot', width: 30 },
      wider: { parent: 'wide', left: 2 },
      turned: { parent: 'dot', rotate: 1 },
      mirror: { parent: 'flipped' },
      loop: { parent: 'round' },
      round: { parent: 'loop' },
    },
  }

  it('reads each side of the box from the nearest alias, the icon, the set, then Iconify’s 16', () => {
    expect(fromIconify(set, 'plain').viewBox).toBe('0 0 16 20')
    expect(fromIconify(set, 'dot').viewBox).toBe('0 0 10 20')
    expect(fromIconify(set, 'wider').viewBox).toBe('2 0 30 20')
    expect(fromIconify(set, 'wider').nodes).toEqual(fromIconify(set, 'dot').nodes)
  })

  it.each([
    ['a missing icon', 'nope', /"test:nope".*no icon nope/],
    ['a transformed alias', 'turned', /rotates or flips/],
    ['an icon that flips itself', 'flipped', /flipped rotates or flips itself/],
    ['an alias of one', 'mirror', /flipped rotates or flips itself/],
    ['a circle of aliases', 'loop', /round in a circle/],
    ['a name from the prototype', 'constructor', /no icon constructor/],
  ])('refuses %s', (_, name, reason) => {
    expect(() => fromIconify(set, name)).toThrow(reason)
  })

  it('names its icons and its aliases', () => {
    expect(namesOf(set)).toEqual([
      'dot',
      'plain',
      'flipped',
      'wide',
      'wider',
      'turned',
      'mirror',
      'loop',
      'round',
    ])
  })
})

describe('Icon.key and Icon.prefixIds', () => {
  const gradient = parse(
    `<svg viewBox="0 0 8 8" mask="url(#m)"><defs><linearGradient id="a"><stop offset="0"/></linearGradient><mask id="m"><rect width="8" height="8"/></mask></defs><rect fill="url( '#a' )" stroke="URL(#a)" width="8" height="8"/><use href="#a"/><path fill="url( #m )"/></svg>`,
    'gradient',
  )

  it('give one drawing one key, read twice or parsed twice, and another drawing another', () => {
    expect(Icon.key(gradient)).toBe(Icon.key(parse(Icon.serialize(gradient), 'again')))
    expect(Icon.key(gradient)).toMatch(/^i[0-9a-z]+$/)
    const other = parse('<svg viewBox="0 0 8 8"><path d="M0 0"/></svg>', 'other')
    const moved = parse('<svg viewBox="0 0 8 8"><path d="M0 1"/></svg>', 'moved')
    expect(Icon.key(other)).not.toBe(Icon.key(moved))
  })

  it('keeps apart drawings that collide under a 32-bit FNV key', () => {
    const first = parse('<svg viewBox="0 0 1 1"><path d="M201917 0"/></svg>', 'first')
    const second = parse('<svg viewBox="0 0 1 1"><path d="M1144000 0"/></svg>', 'second')
    expect(Icon.key(first)).not.toBe(Icon.key(second))
  })

  it('rename every id the icon defines, and every reference to one, spaced or not', () => {
    const renamed = Icon.prefixIds(gradient, 'p')
    expect(renamed.attributes).toEqual({ mask: 'url(#p-m)' })
    expect(renamed.nodes[0]!.children.map(node => node.attributes['id'])).toEqual(['p-a', 'p-m'])
    expect(renamed.nodes[1]!.attributes).toEqual({
      fill: "url('#p-a')",
      stroke: 'url(#p-a)',
      width: '8',
      height: '8',
    })
    expect(renamed.nodes[2]!.attributes).toEqual({ href: '#p-a' })
    expect(renamed.nodes[3]!.attributes).toEqual({ fill: 'url(#p-m)' })
  })

  it('rename no reference to an id the icon does not define, in a drawing made by hand', () => {
    const made = {
      viewBox: '0 0 8 8',
      attributes: {},
      nodes: [{ tag: 'path' as const, attributes: { id: 'a', fill: 'url(#page)' }, children: [] }],
    }
    expect(Icon.prefixIds(made, 'p').nodes[0]!.attributes).toEqual({
      id: 'p-a',
      fill: 'url(#page)',
    })
  })

  it('encodes a prefix that could turn a local paint reference into an external one', () => {
    const renamed = Icon.prefixIds(gradient, 'copy) url(https://evil.test/paint')
    const serialized = Icon.serialize(renamed)
    expect(serialized).not.toContain('evil.test')
    expect(renamed.attributes.mask).toMatch(/^url\(#fk_[0-9a-f]+-m\)$/)
    const generated = /^url\(#(fk_[0-9a-f]+)-m\)$/.exec(renamed.attributes.mask!)![1]!
    expect(Icon.prefixIds(gradient, generated).attributes.mask).not.toBe(renamed.attributes.mask)
  })

  it('keep what they made, and leave an icon with no ids as it is', () => {
    expect(Icon.prefixIds(gradient, 'p')).toBe(Icon.prefixIds(gradient, 'p'))
    expect(Icon.prefixIds(gradient, 'q')).not.toEqual(Icon.prefixIds(gradient, 'p'))
    const plain = parse('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>', 'plain')
    expect(Icon.prefixIds(plain, 'p')).toBe(plain)
  })
})

describe('Icon.withStroke', () => {
  const stroked = parse(
    '<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1 1"/></g></svg>',
    'stroked',
  )

  it('replaces the strokes the drawing sets, and sets on its root the ones it does not', () => {
    const redrawn = Icon.withStroke(stroked, { width: 3, corners: 'square' })
    expect(redrawn.nodes[0]!.attributes).toEqual({
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '3',
      'stroke-linecap': 'square',
    })
    expect(redrawn.attributes).toEqual({ 'stroke-linejoin': 'miter' })
    expect(redrawn.nodes[0]!.children).toEqual(stroked.nodes[0]!.children)
  })

  it('leaves a drawing as it was when asked for nothing', () => {
    expect(Icon.withStroke(stroked, {})).toEqual(stroked)
  })
})
