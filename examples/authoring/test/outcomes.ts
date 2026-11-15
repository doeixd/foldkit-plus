/**
 * What becomes of a save, asserted once for every way of saving. A driver says
 * how to edit the title and how to save; everything read back is the state the
 * application already holds (the Model's field and Remote's ledger), so the
 * same assertions hold for a person's click and an agent's call. The server is
 * the one that decides: the refusal is the writer's, and the driver never
 * learns a rule.
 */
import { Option } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { State } from '../src/save/app.js'
import type { Server } from '../src/save/server.js'

/** How the save ended, as the driver saw it: the agent's completion, or the ledger for a click. */
export type Ending = 'completed' | 'failed'

export interface Driver {
  readonly edit: (text: string) => Promise<void>
  /** Starts a save and settles with how it ended, once the server has answered. */
  readonly save: () => Promise<Ending>
  readonly state: () => State
}

export interface Booted {
  readonly driver: Driver
  readonly server: Server
  readonly dispose: () => void | Promise<void>
}

const statuses = (state: State) => state.saves.map(save => save.status)

export const outcomes = (name: string, boot: () => Promise<Booted>) =>
  describe(`a save, ${name}`, () => {
    let booted: Booted | undefined
    const start = async () => {
      booted = await boot()
      booted.server.hold()
      return booted
    }
    afterEach(async () => {
      await booted?.dispose()
      booted = undefined
    })

    /** A save is asked for, accepted and pending before the writer has decided anything. */
    const pending = async (driver: Driver, server: Server, count: number) => {
      await vi.waitFor(() => expect(server.waiting()).toBe(count))
      await vi.waitFor(() => expect(statuses(driver.state())).toEqual(Array(count).fill('Pending')))
    }

    it('is pending while the writer has not decided, and applied when it accepts', async () => {
      const { driver, server } = await start()
      await driver.edit('First')
      let ended: Ending | undefined
      const saving = driver.save().then(how => (ended = how))
      await pending(driver, server, 1)
      expect(driver.state().draft).toBe('First')
      // The call resolves on the answer, not on the dispatch.
      expect(ended).toBeUndefined()

      server.answer('writer')
      await saving
      expect(ended).toBe('completed')
      expect(driver.state().saves).toMatchObject([{ status: 'Applied', refusal: Option.none() }])
      expect(server.decided()).toEqual(['First'])
    })

    it("fails with the writer's reason when it refuses, and keeps what was typed", async () => {
      const { driver, server } = await start()
      await driver.edit('   ')
      const saving = driver.save()
      await pending(driver, server, 1)
      server.answer('writer')
      expect(await saving).toBe('failed')
      expect(driver.state().saves).toMatchObject([
        { status: 'Failed', refusal: Option.some('A title is required.') },
      ])
      expect(driver.state().draft).toBe('   ')
    })

    it('fails with no reason when the writer cannot be reached', async () => {
      const { driver, server } = await start()
      await driver.edit('Offline')
      const saving = driver.save()
      await pending(driver, server, 1)
      server.answer('down')
      expect(await saving).toBe('failed')
      expect(driver.state().saves).toMatchObject([{ status: 'Failed', refusal: Option.none() }])
      expect(driver.state().draft).toBe('Offline')
    })

    it('keeps two saves apart: each ends on its own answer, in the order asked', async () => {
      const { driver, server } = await start()
      await driver.edit('One')
      const first = driver.save()
      await pending(driver, server, 1)
      await driver.edit('Two')
      const second = driver.save()
      await pending(driver, server, 2)

      // The writer refuses nothing here; the first answer must end the first save alone.
      server.answer('writer')
      expect(await first).toBe('completed')
      await vi.waitFor(() => expect(statuses(driver.state())).toEqual(['Applied', 'Pending']))
      server.answer('down')
      expect(await second).toBe('failed')
      expect(statuses(driver.state())).toEqual(['Applied', 'Failed'])
      expect(server.decided()).toEqual(['One'])
    })
  })
