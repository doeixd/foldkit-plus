// @vitest-environment jsdom
/**
 * The ways Foldkit draws a view today agree: its runtime in jsdom (the
 * reference), Scene, and the server. Each case's disagreements must be
 * exactly those `conformance/known.ts` records.
 */
import { describe, expect, it } from 'vitest'
import { cases } from './conformance/cases.js'
import { runtime, scene, server } from './conformance/drawers.js'
import { ofElement } from './conformance/markup.js'
import { conformanceSuite } from './conformance/suite.js'

conformanceSuite({ reference: runtime, live: [scene], static: [server] })

describe('keys', () => {
  const observed = async (name: string) => {
    const subject = cases.find(each => each.name === name)
    if (subject === undefined) throw new Error(`no case ${name}`)
    return {
      runtime: await subject.run(each => runtime.play(each)),
      scene: await subject.run(each => scene.play(each)),
    }
  }

  it('the runtime tells a keyed list from a positional one, and Scene does not', async () => {
    const keyed = await observed('keyed list with Mounts')
    const positional = await observed('positional list with Mounts')
    expect(keyed.runtime).not.toEqual(positional.runtime)
    expect(keyed.scene).toEqual(positional.scene)
    // Dropping the first keyed row ends that row's own Mount.
    expect(keyed.runtime[1]?.mounts).toEqual([{ event: 'ended', name: 'Watch', args: { id: 'a' } }])
  })
})

describe('the reading of drawn markup', () => {
  it('reads what a field holds, not the value its markup started with', () => {
    const field = document.createElement('input')
    field.setAttribute('value', 'served')
    field.value = 'typed'
    expect(ofElement(field)).toBe('<input value="typed">')
  })
})
