import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Metadata, MetadataTypeId, Module, Projection, Surface } from '../src/index.js'
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

    expect(Metadata.summarize(page.metadata)).toEqual([])
    expect(Flags.get(page.metadata)).toEqual([])
    expect(Metadata.summarize(Flags.of())).toEqual([])
  })

  it('summarizes every key as text for tooling', () => {
    const page = Projection.struct({
      project: entity('Project', 'p1', ['name']),
      beta: flag('beta'),
    })

    expect(Metadata.summarize(page.metadata)).toEqual([
      { name: 'remote-like', entries: ['Project:p1 [name]'] },
      { name: 'flags', entries: ['beta'] },
    ])
  })

  it('cannot be forged past a key or changed after it is made', () => {
    const forged = Object.freeze({ [MetadataTypeId]: MetadataTypeId }) as Metadata
    expect(Flags.get(forged)).toEqual([])
    expect(Metadata.summarize(forged)).toEqual([])

    const made = Projection.struct({ a: flag('beta'), b: flag('gamma') }).metadata
    expect(() => (Flags.get(made) as string[]).push('delta')).toThrow(TypeError)
    expect(() => (Flags.get(flag('beta').metadata) as string[]).push('delta')).toThrow(TypeError)
    const none = Projection.fromReader(Schema.String, () => '').metadata
    expect(() => (Flags.get(none) as string[]).push('delta')).toThrow(TypeError)
    expect(Flags.get(made)).toEqual(['beta', 'gamma'])
  })

  it('reaches Surface.inspect, Surface.contract, and Module.toMarkdown', () => {
    const Page = Surface.make(App, 'Page', {
      model: () =>
        Projection.struct({
          project: entity('Project', 'p1', ['name']),
          odd: flag('a\\|b\r\nc\rd'),
        }),
    })
    const summaries = [
      { name: 'remote-like', entries: ['Project:p1 [name]'] },
      { name: 'flags', entries: ['a\\|b\r\nc\rd'] },
    ]

    expect(Surface.inspect(Page, undefined).metadata).toEqual(summaries)
    expect(Surface.contract(Page, undefined).metadata).toEqual(summaries)
    expect(Module.toMarkdown(Module.make(App, [Page]))).toContain(
      '| remote-like: Project:p1 [name]; flags: a\\\\\\|b c d |',
    )
  })

  it('treats a copy of metadata as empty, alone or beside a sibling', () => {
    const original = flag('beta').metadata
    for (const copy of [{ ...original }, structuredClone(original)]) {
      expect(Flags.get(copy)).toEqual([])
      const lone = Projection.struct({
        a: Projection.fromReader(Schema.Boolean, () => false, { metadata: copy }),
      })
      expect(Flags.get(lone.metadata)).toEqual([])
    }
  })

  it('does not mistake a model shape with read and metadata fields for a Projection', () => {
    const Page = App.surface('Page', {
      model: ({ model }) => ({ read: model.todos, metadata: model.selectedTodoId }),
    })
    expect(Page.projection(undefined).dependencies).toEqual([['todos'], ['selectedTodoId']])
  })
})
