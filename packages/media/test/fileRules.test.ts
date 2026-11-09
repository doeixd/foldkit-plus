// @vitest-environment node
/**
 * What a file upload's name and type must be, the key grammar a download is
 * refused outside, and the headers every download answer carries.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  acceptor,
  dispositionOf,
  fileHeaders,
  fileNameOf,
  isFileKey,
  mediaTypeOf,
} from '../src/server/fileRules.js'

describe('isFileKey', () => {
  it.each([
    ['0123456789abcdef0123456789abcdef', true],
    ['0123456789ABCDEF0123456789abcdef', false],
    ['0123456789abcdef0123456789abcde', false],
    ['0123456789abcdef0123456789abcdef0', false],
    ['facts/0123456789abcdef0123456789a', false],
    ['../3456789abcdef0123456789abcdef0', false],
    ['', false],
  ])('%j is a key: %s', (key, valid) => {
    expect(isFileKey(key)).toBe(valid)
  })
})

describe('fileNameOf', () => {
  it.each([
    ['report.pdf', 'report.pdf'],
    ['%E6%97%A5%E6%9C%AC.txt', '日本.txt'],
    ['a%20b%25.txt', 'a b%.txt'],
    // 85 three-byte characters: 255 bytes exactly.
    [encodeURIComponent('日'.repeat(85)), '日'.repeat(85)],
  ])('takes %j', (header, name) => {
    expect(fileNameOf(header)).toEqual(Option.some(name))
  })

  it.each([
    ['nothing sent', undefined],
    ['empty', ''],
    ['a truncated escape', 'a%E6%97'],
    ['an escape cut short', 'a%2'],
    ['bytes that are not UTF-8', '%FF.txt'],
    ['256 bytes', encodeURIComponent('日'.repeat(85)) + 'a'],
    // 128 UTF-16 units, 256 bytes: the limit counts bytes.
    ['256 bytes in two-byte characters', encodeURIComponent('é'.repeat(128))],
    ['a control character', 'a%07.txt'],
    ['a NUL', 'a%00.txt'],
    ['a right-to-left override', 'a%E2%80%AEfdp.exe'],
    ['a zero-width space', 'a%E2%80%8B.txt'],
    ['an Arabic letter mark', 'a%D8%9C.txt'],
    ['a byte-order mark', '%EF%BB%BFa.txt'],
    ['a line separator', 'a%E2%80%A8.txt'],
    ['a paragraph separator', 'a%E2%80%A9.txt'],
    ['an encoded slash', '..%2Fetc'],
    ['a slash', '../etc'],
    ['a backslash', '..%5Cetc'],
  ])('refuses %s', (_, header) => {
    expect(fileNameOf(header)).toEqual(Option.none())
  })
})

describe('mediaTypeOf', () => {
  it.each([
    ['image/png', 'image/png'],
    ['Image/PNG', 'image/png'],
    ['text/html;x=image/png', 'text/html'],
    [' application/pdf ; charset=binary', 'application/pdf'],
    ['application/vnd.ms-excel', 'application/vnd.ms-excel'],
  ])('reads %j as %j', (header, type) => {
    expect(mediaTypeOf(header)).toEqual(Option.some(type))
  })

  it.each([
    undefined,
    '',
    'image',
    'image/',
    '/png',
    'image/png/x',
    'text/html,image/png',
    'a b/c',
  ])('refuses %j', header => {
    expect(mediaTypeOf(header)).toEqual(Option.none())
  })
})

describe('acceptor', () => {
  const declared = (header: string) => Option.getOrThrow(mediaTypeOf(header))

  it('takes any type for *', () => {
    expect(acceptor('*')(declared('text/html'))).toBe(true)
  })

  it('compares a type whole and without regard to case', () => {
    const accepts = acceptor(['Image/PNG', 'application/pdf'])
    expect(accepts(declared('image/png'))).toBe(true)
    expect(accepts(declared('IMAGE/png'))).toBe(true)
    expect(accepts(declared('text/html;x=image/png'))).toBe(false)
    expect(accepts(declared('application/pdfx'))).toBe(false)
    expect(accepts(declared('image/pn'))).toBe(false)
  })

  it('takes every subtype of a type/* pattern, and no other type', () => {
    const accepts = acceptor(['image/*'])
    expect(accepts(declared('image/jpeg'))).toBe(true)
    expect(accepts(declared('imagex/jpeg'))).toBe(false)
    expect(accepts(declared('text/image'))).toBe(false)
  })

  it.each(['image', 'image/png/x', '*/*', '*/png', 'image/png; q=1'])(
    'refuses the pattern %j where the route is made',
    pattern => {
      expect(() => acceptor([pattern])).toThrow(pattern)
    },
  )
})

const SERVED = {
  'content-type': 'application/octet-stream',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "sandbox; default-src 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'cache-control': 'private, no-store',
}

describe('fileHeaders', () => {
  it('answers a refusal with the served headers alone', () => {
    expect(fileHeaders(Option.none())).toEqual(SERVED)
  })

  it('names a file as an attachment beside them', () => {
    expect(fileHeaders(Option.some('a.txt'))).toEqual({
      ...SERVED,
      'content-disposition': `attachment; filename="a.txt"; filename*=UTF-8''a.txt`,
    })
  })
})

describe('dispositionOf', () => {
  const parts = (name: string) => {
    const [, fallback, encoded] = /^attachment; filename="(.*)"; filename\*=UTF-8''(.*)$/.exec(
      dispositionOf(name),
    )!
    return { fallback: fallback!, encoded: encoded! }
  }

  it("percent-encodes everything outside RFC 5987's attribute characters", () => {
    expect(parts("rés'umé (1)*!~.pdf").encoded).toBe('r%C3%A9s%27um%C3%A9%20%281%29%2A!~.pdf')
  })

  it.each(['日本.txt', '😀 "quoted" \\ 100%.txt', "it's (a)*.pdf"])(
    'encodes %j so it decodes back',
    name => {
      const { encoded } = parts(name)
      expect(decodeURIComponent(encoded)).toBe(name)
      expect(encoded).toMatch(/^[A-Za-z0-9!#$&+\-.^_`|~%]*$/)
    },
  )

  it('keeps only letters, digits, space, dot, underscore and dash in the fallback', () => {
    expect(parts('a"b\\c%d;e.txt').fallback).toBe('a_b_c_d_e.txt')
    expect(parts('Q1 report_v-2.pdf').fallback).toBe('Q1 report_v-2.pdf')
    expect(parts('😀日.txt').fallback).toBe('__.txt')
  })
})
