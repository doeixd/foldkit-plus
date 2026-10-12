/**
 * Which code spans become links: a name that names one thing, and nothing a
 * reader would read as their own word.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { links, type Target } from '../src/content/links.js'

const target = (
  name: string,
  path: string,
  subsite: string,
  { declared = true, namespace = false } = {},
): Target => ({ name, path, subsite, declared, namespace })

const { linkOf } = links(
  [
    target('foldkit-remote', '/remote', 'remote'),
    target('Remote', '/remote/api/remote/remote', 'remote', { namespace: true }),
    target('Remote.make', '/remote/api/remote/remote#make', 'remote'),
    // Re-exported by another package: the declaring one wins.
    target('Entity', '/entity/api/entity/entity', 'entity', { namespace: true }),
    target('Entity', '/remote/api/remote/entity', 'remote', { declared: false, namespace: true }),
    // Declared twice: only a page in the same subsite settles it.
    target('Query', '/remote/api/remote/query', 'remote'),
    target('Query', '/entity/api/entity/query', 'entity'),
    target('Loading', '/crud/api/crud/loading', 'crud'),
    target('update', '/bundle/api/bundle/update', 'bundle'),
    target('Model', '/remote/api/remote/model', 'remote'),
  ],
  path => path.split('/')[1] ?? '',
)

const at = (code: string, from = '/sync/guides/intro') => Option.getOrUndefined(linkOf(code, from))

describe('linkOf', () => {
  it('links a package, an export and a member, a call written after one too', () => {
    expect([at('foldkit-remote'), at('Remote'), at('Remote.make'), at('Remote.make()')]).toEqual([
      '/remote',
      '/remote/api/remote/remote',
      '/remote/api/remote/remote#make',
      '/remote/api/remote/remote#make',
    ])
  })

  it('takes the declaring package over a re-export', () => {
    expect(at('Entity')).toBe('/entity/api/entity/entity')
  })

  it('settles a name two packages declare by the page’s own subsite, or not at all', () => {
    expect(at('Query', '/remote/guides/queries')).toBe('/remote/api/remote/query')
    expect(at('Query', '/entity/guides/x')).toBe('/entity/api/entity/query')
    expect(at('Query')).toBeUndefined()
  })

  it('links one plain word only in its own subsite', () => {
    expect(at('Loading', '/crud/guides/list')).toBe('/crud/api/crud/loading')
    expect(at('Loading', '/remote/guides/remotedata')).toBeUndefined()
  })

  it('leaves a lowercase word, a name every application has, and anything more than a name', () => {
    expect([at('update'), at('Model'), at('Remote.make({ model })'), at('a + b')]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('does not link a page to itself', () => {
    expect(at('Remote.make', '/remote/api/remote/remote')).toBeUndefined()
  })
})
