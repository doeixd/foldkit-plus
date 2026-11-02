/** The cookie store: read from a `Cookie` header, set by a server's answer. */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mirror } from '../src/index.js'

const Model = Schema.Struct({
  names: Schema.Array(Schema.String),
  theme: Schema.Literals(['light', 'dark']),
})
type Model = typeof Model.Type
const initial: Model = { names: [], theme: 'light' }
const App = Surface.application({
  Model,
  Message: defineMessageUnion({}),
  initial,
  update: model => ({ model }),
})
const Prefs = Mirror.cookie(App, {
  name: 'prefs',
  fields: [App.model.names, App.model.theme],
  // A store key named like an `Object.prototype` member.
  keys: { theme: { key: '__proto__' } },
})
const http = { url: 'http://shop.test/' }
const https = { url: 'https://shop.test/' }
const cookieSet = (line: Option.Option<string>): string => Option.getOrThrow(line).split('; ')[0]!

describe('Mirror.cookie', () => {
  it('reads its own cookie among others, and the keys it owns in it', () => {
    const header = 'other=1; prefs=__proto__=dark&names=%5B%22a%22%5D&extra=x; prefs2=y'
    // A literal `__proto__:` would set the prototype, not a key.
    expect(Prefs.keysOf(header)).toEqual(
      Object.fromEntries([
        ['__proto__', 'dark'],
        ['names', '["a"]'],
      ]),
    )
    expect(Mirror.bootstrap(initial, Prefs.bootstrap(Prefs.keysOf(header)))).toEqual({
      names: ['a'],
      theme: 'dark',
    })
  })

  it('a missing header or cookie holds nothing', () => {
    expect(Prefs.keysOf(null)).toEqual({})
    expect(Prefs.keysOf('')).toEqual({})
    // Cookies whose names hold the mirror's, holding keys it owns.
    expect(Prefs.keysOf('prefsx=__proto__=dark; xprefs=names=%5B%22a%22%5D')).toEqual({})
  })

  it('a value that does not decode is an issue, and the field keeps its initial value', () => {
    const keys = Prefs.keysOf('prefs=__proto__=blue&names=%7B')
    expect(Prefs.decode(keys).issues.map(issue => issue.key)).toEqual(['names', '__proto__'])
    expect(Mirror.bootstrap(initial, Prefs.bootstrap(keys))).toBe(initial)
  })

  it('a cookie past maxBytes is read as holding nothing', () => {
    const Small = Mirror.cookie(App, {
      name: 'small',
      fields: [App.model.theme],
      initial,
      maxBytes: 'small=theme=dark'.length,
    })
    expect(Small.keysOf('small=theme=dark')).toEqual({ theme: 'dark' })
    expect(Small.keysOf('small=theme=dark&')).toEqual({})
  })

  it('setCookie encodes the slice so no character ends the value, and reads back', () => {
    const model: Model = { names: ['a; b', 'c,d', 'é=1', '"q"\\', ' sp '], theme: 'dark' }
    const pair = cookieSet(Prefs.setCookie(model, http))
    const value = pair.slice('prefs='.length)
    // RFC 6265's cookie-octet: no control, space, `"`, `,`, `;` or `\`.
    expect(value).toMatch(/^[!#-+\--:<-[\]-~]*$/)
    expect(Mirror.bootstrap(initial, Prefs.bootstrap(Prefs.keysOf(`x=1; ${pair}`)))).toEqual(model)
  })

  it('sets sane attributes by default, Secure for an https request only', () => {
    const model: Model = { names: [], theme: 'dark' }
    expect(Option.getOrThrow(Prefs.setCookie(model, http))).toBe(
      'prefs=__proto__=dark; Path=/; SameSite=Lax; Max-Age=31536000',
    )
    expect(Option.getOrThrow(Prefs.setCookie(model, https))).toBe(
      'prefs=__proto__=dark; Path=/; SameSite=Lax; Max-Age=31536000; Secure',
    )
  })

  it('takes its attributes from the config', () => {
    const Set = Mirror.cookie(App, {
      name: 'set',
      fields: [App.model.theme],
      initial,
      attributes: {
        path: '/shop',
        domain: 'shop.test',
        sameSite: 'Strict',
        secure: true,
        maxAge: '1 hour',
      },
    })
    expect(Option.getOrThrow(Set.setCookie({ ...initial, theme: 'dark' }, http))).toBe(
      'set=theme=dark; Path=/shop; Domain=shop.test; SameSite=Strict; Max-Age=3600; Secure',
    )
    const Never = Mirror.cookie(App, {
      name: 'never',
      fields: [App.model.theme],
      initial,
      attributes: { secure: false },
    })
    expect(Option.getOrThrow(Never.setCookie({ ...initial, theme: 'dark' }, https))).not.toMatch(
      /Secure/,
    )
  })

  it('a slice at its defaults clears the cookie', () => {
    expect(Option.getOrThrow(Prefs.setCookie(initial, http))).toBe(
      'prefs=; Path=/; SameSite=Lax; Max-Age=0',
    )
  })

  it('a slice past maxBytes sets nothing', () => {
    const Small = Mirror.cookie(App, {
      name: 'tiny',
      fields: [App.model.theme],
      initial,
      maxBytes: 'tiny=theme=dark'.length,
    })
    expect(Option.isSome(Small.setCookie({ ...initial, theme: 'dark' }, http))).toBe(true)
    const Smaller = Mirror.cookie(App, {
      name: 'tinier',
      fields: [App.model.theme],
      initial,
      maxBytes: 'tinier=theme=dark'.length - 1,
    })
    expect(Smaller.setCookie({ ...initial, theme: 'dark' }, http)).toEqual(Option.none())
  })

  it.each([
    ['a name that is not a token', { name: 'a b' }],
    ['a name holding =', { name: 'a=b' }],
    ['a path holding ;', { name: 'p', attributes: { path: '/; Domain=evil.test' } }],
    ['a relative path', { name: 'p', attributes: { path: 'shop' } }],
    ['a domain holding a space', { name: 'p', attributes: { domain: 'a .test' } }],
    ['SameSite=None without Secure', { name: 'p', attributes: { sameSite: 'None' as const } }],
    ['a Max-Age under a second', { name: 'p', attributes: { maxAge: 0 } }],
    ['a Max-Age with no finite end', { name: 'p', attributes: { maxAge: 'Infinity' as const } }],
    ['no maxBytes', { name: 'p', maxBytes: 0 }],
  ])('refuses %s when it is declared', (_, config) => {
    expect(() => Mirror.cookie(App, { ...config, fields: [App.model.theme], initial })).toThrow(
      /Mirror\.cookie/,
    )
  })

  it('SameSite=None is allowed with Secure', () => {
    const None = Mirror.cookie(App, {
      name: 'none',
      fields: [App.model.theme],
      initial,
      attributes: { sameSite: 'None', secure: true },
    })
    expect(Option.getOrThrow(None.setCookie({ ...initial, theme: 'dark' }, http))).toMatch(
      /SameSite=None; Max-Age=\d+; Secure$/,
    )
  })

  it('joins an assembly with its write and no Messages', () => {
    const wiring = Prefs.wiring()
    expect(wiring.handles).toEqual([])
    expect(wiring.key).toBe('mirror:prefs')
    expect(Object.keys(Prefs.subscriptions)).toEqual(['prefs.mirror'])
  })
})
