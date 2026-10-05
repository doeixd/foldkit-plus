/**
 * The card data against the repository: the root README lists exactly these
 * demos, and every file and package a card names exists, so a card cannot
 * link to something moved or renamed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { demos } from '../src/demos.js'
import { demoList, listIn, withDemos } from '../src/readme.js'

const root = join(import.meta.dirname, '../../..')
const exists = (path: string) => existsSync(join(root, path))

describe('the demos', () => {
  it('are what the root README lists (pnpm --filter foldkit-example-site readme writes it)', () => {
    expect(listIn(readFileSync(join(root, 'README.md'), 'utf8'))).toBe(demoList())
  })

  it.each(demos.map(demo => [demo.title, demo] as const))(
    '%s names files that exist',
    (_, demo) => {
      const missing = [
        demo.example,
        demo.readFirst,
        ...demo.packages.map(name => `packages/${name}/README.md`),
      ].filter(path => !exists(path))
      expect(missing).toEqual([])
      expect(demo.readFirst.startsWith(`${demo.example}/`)).toBe(true)
    },
  )

  it('are each published at an address of their own', () => {
    const urls = demos.map(demo => demo.url)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.every(url => url.startsWith('https://'))).toBe(true)
  })
})

describe('the README list', () => {
  it('is written between the markers, keeping what is around them', () => {
    const written = withDemos('before\n<!-- demos -->\nold\n<!-- /demos -->\nafter')
    expect(written).toBe(`before\n<!-- demos -->\n${demoList()}\n<!-- /demos -->\nafter`)
  })

  it('refuses a README without its markers', () => {
    expect(() => withDemos('no markers here')).toThrow('the README has no')
  })
})
