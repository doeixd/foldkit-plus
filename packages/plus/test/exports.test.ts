/** The root and a subpath reach the packages they name, as one module each. */
import { describe, expect, it } from 'vitest'

import * as Plus from '../src/index.js'
import * as Port from '../src/remote/port.js'
import { Remote } from 'foldkit-remote'
import * as RemotePort from 'foldkit-remote/port'

describe('foldkit-plus', () => {
  it('hands out the packages’ own values, not copies', () => {
    expect(Plus.Remote).toBe(Remote)
    expect(Object.keys(Port).sort()).toEqual(Object.keys(RemotePort).sort())
  })
})
