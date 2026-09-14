import { describe, expect, it } from 'vitest'
import { Metadata, Projection, Surface } from '../src/index.js'
import { Flags, flag } from './flagsLikeFixture.js'
import { EntityNeeds, entity, type EntityNeed } from './remoteLikeFixture.js'
import { App, Model } from './todoFixture.js'

describe('Projection metadata', () => {
  it('survives struct, of, array, option, select, and a Surface', () => {
    const selected = App.model.todos.select(Projection.array(entity('Todo', 't1', ['title'])))
    const of = Projection.of(Model)({ todos: true, selectedTodoId: flag('beta') })
    const surface = Surface.make(App, 'Page', {
      model: () => Projection.struct({ selected, of }),
    })
    // A different root, so it cannot share the struct above.
    const nested = Projection.array(Projection.option(flag('gamma')))

    const metadata = surface.projection(undefined).metadata

    expect(EntityNeeds.get(metadata)).toEqual([{ entity: 'Todo', id: 't1', fields: ['title'] }])
    expect(Flags.get(metadata)).toEqual(['beta'])
    expect(Flags.get(nested.metadata)).toEqual(['gamma'])
  })

  it('merges one key across siblings with that key’s own merge', () => {
    const page = Projection.struct({
      name: entity('Project', 'p1', ['name']),
      owner: entity('Project', 'p1', ['owner', 'name']),
      again: flag('beta'),
      twice: flag('beta'),
    })

    expect(EntityNeeds.get(page.metadata)).toEqual([
      { entity: 'Project', id: 'p1', fields: ['name', 'owner'] },
    ])
    expect(Flags.get(page.metadata)).toEqual(['beta'])
  })

  it('looks entries up by key identity, not by name', () => {
    const Impostor = Metadata.key<EntityNeed>('remote-like', { merge: v => v, summarize: () => '' })
    const page = Projection.struct({ project: entity('Project', 'p1', ['name']) })

    expect(Impostor.get(page.metadata)).toEqual([])
  })

  it('carries nothing for projections of plain Model fields', () => {
    const page = Projection.struct({ todos: App.model.todos, selection: App.model.selectedTodoId })

    expect(page.metadata.entries.size).toBe(0)
    expect(Flags.get(page.metadata)).toEqual([])
    expect(Flags.of()).toBe(Metadata.empty)
  })

  it('summarizes every key as text for tooling', () => {
    const page = Projection.struct({
      project: entity('Project', 'p1', ['name']),
      beta: flag('beta'),
    })

    expect(Metadata.summarize(page.metadata)).toEqual([
      { interpreter: 'remote-like', entries: ['Project:p1 [name]'] },
      { interpreter: 'flags', entries: ['beta'] },
    ])
  })
})
