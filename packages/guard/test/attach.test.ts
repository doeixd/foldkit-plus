// @vitest-environment node
/**
 * Attaching guards to an Entity: per surface and interaction, merged across
 * attachments, read back through the matrix and the fields they read.
 */
import { Option, Schema } from 'effect'
import { Entity, Expr, ReadFilter, Relation } from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'
import { describe, expect, it } from 'vitest'
import { Guards, Interaction } from '../src/index.js'

const User = Schema.Struct({ id: Schema.String, projectIds: Schema.Array(Schema.String) })

const ProjectBase = Entity.define('Project', Schema.Struct({ id: Schema.String }))
const { Project, Todo: TodoFields } = Entity.relate(
  {
    Project: ProjectBase,
    Todo: Entity.define(
      'Todo',
      Schema.Struct({
        id: Schema.String,
        ownerId: Schema.String,
        projectId: Schema.String,
        email: Schema.String,
        notes: Schema.String,
      }),
    ),
  },
  { Todo: { project: Relation.one(ProjectBase), watchers: Relation.many(ProjectBase) } },
)

const G = Guards.declare(
  'Todos',
  User,
  guard => ({
    isAdmin: guard.principal(),
    signedIn: guard.principal(),
    isOwner: guard.row(TodoFields, p => Expr.eq(TodoFields.fields.ownerId, p.id)),
    inProject: guard.row(TodoFields, p => Expr.in(TodoFields.fields.projectId, p.projectIds)),
  }),
  { key: user => user.id },
)

const Archive = Interaction.make('Archive')

const Todo = TodoFields.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, G.inProject, G.isAdmin],
      Write: [G.isOwner],
      Delete: [G.isAdmin],
    },
    interactions: {
      [Archive.key]: Guards.on([G.isAdmin], Guards.explain('Only an admin may archive.')),
    },
    members: {
      notes: { Read: [G.isOwner] },
      email: { Read: Guards.on([G.isOwner], Guards.redact('hidden')) },
      ownerId: { Update: [G.isAdmin] },
    },
    relations: { watchers: { Read: [G.isOwner], Unlink: [G.isAdmin] } },
    always: [G.signedIn],
  }),
)

describe('attach', () => {
  it('keeps the Entity, so a guard over the base is a guard over the result', () => {
    expect(Entity.same(Todo, TodoFields)).toBe(true)
    expect(Option.isNone(Guards.attached(TodoFields))).toBe(true)
  })

  it('declares what the row’s Read rules read, for a client that places rows', () => {
    expect([...ReadFilter.members(Todo.metadata)].sort()).toEqual(['ownerId', 'projectId'])
    expect(ReadFilter.members(TodoFields.metadata)).toEqual([])
  })

  it('prints every surface it decides, defaults and shorthands resolved', () => {
    expect(Guards.matrix([Todo, Project])).toBe(
      [
        'Todo.always: signedIn',
        'Todo.Read: isOwner | inProject | isAdmin → not_found',
        'Todo.Create: isOwner → forbidden',
        'Todo.Update: isOwner → forbidden',
        'Todo.Delete: isOwner | isAdmin → forbidden',
        'Todo.Archive: isAdmin → explain("Only an admin may archive.")',
        'Todo.notes.Read: isOwner → omit',
        'Todo.email.Read: isOwner → redact("hidden")',
        'Todo.ownerId.Create: isAdmin → forbidden',
        'Todo.ownerId.Update: isAdmin → forbidden',
        'Todo.watchers.Read: isOwner → omit',
        'Todo.watchers.Unlink: isAdmin → forbidden',
        'Project: no guards',
      ].join('\n'),
    )
  })

  it('prints a surface left without guards as the set’s default', () => {
    const Closed = Guards.declare('Closed', User, guard => ({ signedIn: guard.principal() }), {
      key: user => user.id,
      unguarded: 'deny',
    })
    const Locked = Project.pipe(
      Guards.attach(Closed, { row: { Read: [Closed.signedIn], Create: [] } }),
    )
    expect(Guards.matrix([Locked])).toBe(
      [
        'Project.Read: signedIn → not_found',
        'Project.Create: nobody → forbidden',
        'Project.Update: closed',
        'Project.Delete: closed',
      ].join('\n'),
    )
  })

  it('appends a second attachment to each surface and replaces its refusal', () => {
    const Again = Todo.pipe(
      Guards.attach(G, {
        row: { Read: [Guards.all(G.signedIn, G.isAdmin)], Delete: [G.isOwner] },
        members: { email: { Read: Guards.on([G.isAdmin], Guards.redact('***')) } },
      }),
    )
    const lines = Guards.matrix([Again]).split('\n')
    expect(lines).toContain(
      'Todo.Read: isOwner | inProject | isAdmin | all(signedIn, isAdmin) → not_found',
    )
    expect(lines).toContain('Todo.Delete: isOwner | isAdmin | isOwner → forbidden')
    expect(lines).toContain('Todo.email.Read: isOwner | isAdmin → redact("***")')
  })

  it('lets a member’s own Create rule override its Update rule on creation', () => {
    const Own = TodoFields.pipe(
      Guards.attach(G, { members: { ownerId: { Update: [G.isAdmin], Create: [G.signedIn] } } }),
    )
    expect(Guards.matrix([Own]).split('\n')).toContain('Todo.ownerId.Create: signedIn → forbidden')
  })

  it('refuses a row guard over another Entity that shares the name', () => {
    const Twin = Entity.define('Todo', Schema.Struct({ id: Schema.String, ownerId: Schema.String }))
    const Other = Guards.declare(
      'Todos',
      User,
      guard => ({ owns: guard.row(Twin, p => Expr.eq(Twin.fields.ownerId, p.id)) }),
      { key: user => user.id },
    )
    expect(() =>
      TodoFields.pipe(Guards.attach(Other, { row: { Update: [Guards.all(Other.owns)] } })),
    ).toThrow(/Update names owns, a guard over another Entity named Todo/)
  })

  it('refuses the guards of a second set on one Entity', () => {
    const Other = Guards.declare('Other', User, guard => ({ signedIn: guard.principal() }), {
      key: user => user.id,
    })
    expect(() => Todo.pipe(Guards.attach(Other, { always: [Other.signedIn] }))).toThrow(
      /Todo carries the guards of Todos already/,
    )
  })

  it('summarizes under its metadata key, for tooling that reads every key', () => {
    const [summary] = Metadata.summarize(Todo.metadata)
    expect(summary?.name).toBe('foldkit-guard/attachment')
    expect(summary?.entries[0]).toContain('; Read: isOwner | inProject | isAdmin → not_found; ')
  })
})

describe('Interaction.make', () => {
  it('refuses a name every row has already', () => {
    expect(() => Interaction.make('Update')).toThrow(/"Update" is an interaction already/)
  })
})

describe('guardFields', () => {
  it('names what a row interaction’s guards read, always included', () => {
    expect([...Guards.guardFields(Todo, 'Read')].sort()).toEqual(['ownerId', 'projectId'])
    expect(Guards.guardFields(Todo, Archive.key)).toEqual([])
    expect(Guards.guardFields(Project, 'Read')).toEqual([])
  })

  it('counts the relation an inherited Read follows, and a conjunction’s members', () => {
    const Inherits = TodoFields.pipe(
      Guards.attach(G, {
        row: { Read: [Guards.inherit('project')], Update: [Guards.all(G.isAdmin, G.inProject)] },
        always: [G.isOwner],
      }),
    )
    expect(Guards.guardFields(Inherits, 'Read')).toEqual(['project', 'ownerId'])
    expect(Guards.guardFields(Inherits, 'Update')).toEqual(['projectId', 'ownerId'])
    expect(Guards.matrix([Inherits]).split('\n')[1]).toBe('Todo.Read: inherit(project) → not_found')
  })
})
