import { Host } from 'foldkit-host'
import { describe, expect, it } from 'vitest'

interface Env {
  readonly DB: object
}

/** An isolate that counts its builds, failing the ones `fails` names (by build number). */
const counting = (fails: ReadonlySet<number> = new Set()) => {
  let builds = 0
  const get = Host.isolate(
    (env: Env) => env.DB,
    async env => {
      builds += 1
      if (fails.has(builds)) throw new Error(`build ${builds} failed`)
      return { db: env.DB, build: builds }
    },
  )
  return { get, builds: () => builds }
}

describe('Host.isolate', () => {
  it('builds once per binding and shares the value', async () => {
    const { get, builds } = counting()
    const env = { DB: {} }
    const [first, second] = await Promise.all([get(env), get(env)])
    expect(await get({ ...env })).toBe(first)
    expect(second).toBe(first)
    expect(builds()).toBe(1)
  })

  it('builds again for a new binding, as after a reload', async () => {
    const { get, builds } = counting()
    const before = await get({ DB: {} })
    const reloaded = { DB: {} }
    const after = await get(reloaded)
    expect(after).not.toBe(before)
    expect(after.db).toBe(reloaded.DB)
    expect(builds()).toBe(2)
  })

  it('forgets a build that rejected, so the next call builds again', async () => {
    const { get, builds } = counting(new Set([1]))
    const env = { DB: {} }
    await expect(get(env)).rejects.toThrow('build 1 failed')
    expect((await get(env)).build).toBe(2)
    expect(await get(env)).toEqual({ db: env.DB, build: 2 })
    expect(builds()).toBe(2)
  })

  it('forgets a build that threw before it returned a promise', async () => {
    let builds = 0
    const get = Host.isolate(
      (env: Env) => env.DB,
      () => {
        builds += 1
        if (builds === 1) throw new Error('no database yet')
        return builds
      },
    )
    const env = { DB: {} }
    await expect(get(env)).rejects.toThrow('no database yet')
    expect(await get(env)).toBe(2)
  })

  it('keeps each isolate apart over one binding', async () => {
    const env = { DB: {} }
    const one = Host.isolate(
      (each: Env) => each.DB,
      () => 'one',
    )
    const two = Host.isolate(
      (each: Env) => each.DB,
      () => 'two',
    )
    expect([await one(env), await two(env), await one(env)]).toEqual(['one', 'two', 'one'])
  })
})
