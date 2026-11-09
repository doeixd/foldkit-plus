import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'
import { Remote, Selection, type EntityRef } from 'foldkit-remote'
import type { SQL } from 'drizzle-orm'
import {
  applyEdits,
  entity,
  keysetWhere,
  many,
  one,
  type OrderTerm,
  type RelationBinding,
} from '../src/index.js'

// A non-empty ordering always yields a predicate; an arbitrary one may not.
declare const someTerms: readonly OrderTerm[]
declare const oneTerm: OrderTerm
const _predicate: SQL = keysetWhere([oneTerm], [], 'forward')
// @ts-expect-error an ordering that may be empty may have no predicate
const _maybe: SQL = keysetWhere(someTerms, [], 'forward')

const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
})
const projects = pgTable('projects', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id'),
  createdAt: text('created_at').notNull(),
})
const comments = pgTable('comments', {
  id: uuid('id').primaryKey(),
  body: text('body').notNull(),
  projectId: uuid('project_id').notNull(),
})

const UserBinding = entity('User', users)
const CommentBinding = entity('Comment', comments)
const ProjectBinding = entity('Project', projects, {
  relations: {
    owner: one(UserBinding, { field: projects.ownerId, nullable: true }),
    comments: many(CommentBinding, { foreignKey: comments.projectId, localKey: projects.id }),
  },
  computed: { commentCount: { relation: 'comments' } },
})

// A binding is an EntityDescriptor: one declaration serves both the table and
// the Remote selection, and relation and computed fields sit beside the columns.
const _name: 'Project' = ProjectBinding.name
Selection.make(ProjectBinding, {
  id: true,
  name: true,
  owner: true,
  comments: true,
  commentCount: true,
})

// The bindings are the Remote entities, so the domain is declared once.
Remote.define({ entities: [UserBinding, ProjectBinding] })

// @ts-expect-error `nope` is not a field of the table
Selection.make(ProjectBinding, { nope: true })

// `fields` overrides the derived field map, dropping `email` here.
const SlimUser = entity('User', users, {
  fields: { id: Schema.String, name: Schema.String },
})
Selection.make(SlimUser, { id: true, name: true })

// @ts-expect-error the override dropped `email`
Selection.make(SlimUser, { email: true })

// Relations still merge on top of a `fields` override.
const RefinedProject = entity('Project', projects, {
  fields: {
    id: Schema.String,
    name: Schema.String,
    ownerId: Schema.String,
    createdAt: Schema.String,
  },
  relations: { owner: one(UserBinding, { field: projects.ownerId, nullable: true }) },
})
Selection.make(RefinedProject, { owner: true })

// A `one` relation's ref is nullable only when declared so.
const teams = pgTable('teams', { id: uuid('id').primaryKey(), leadId: uuid('lead_id').notNull() })
const TeamBinding = entity('Team', teams, {
  relations: { lead: one(UserBinding, { field: teams.leadId }) },
})
type TeamLead = Schema.Schema.Type<(typeof TeamBinding)['fields']['lead']>
const _lead: EntityRef<'User', any> = null as unknown as TeamLead
type ProjectOwner = Schema.Schema.Type<(typeof ProjectBinding)['fields']['owner']>
const _owner: EntityRef<'User', any> | null = null as unknown as ProjectOwner
// @ts-expect-error a nullable ref is not assignable to a plain ref
const _ownerStrict: EntityRef<'User', any> = null as unknown as ProjectOwner

// A computed count names a collection relation of the binding (#251).
entity('Project', projects, {
  relations: {
    owner: one(UserBinding, { field: projects.ownerId, nullable: true }),
    comments: many(CommentBinding, { foreignKey: comments.projectId, localKey: projects.id }),
  },
  // @ts-expect-error `owner` is a one relation, so there is nothing to count
  computed: { ownerCount: { relation: 'owner' } },
})
entity('Project', projects, {
  relations: {
    comments: many(CommentBinding, { foreignKey: comments.projectId, localKey: projects.id }),
  },
  // @ts-expect-error no relation is named `coments`
  computed: { commentCount: { relation: 'coments' } },
})

// A journal's revision is a field of the binding it applies to (#251).
const revisioned = pgTable('revisioned', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
})
const Revisioned = entity('Revisioned', revisioned)
applyEdits(Revisioned, { revision: 'version' })
// @ts-expect-error no field is named `revison`
applyEdits(Revisioned, { revision: 'revison' })

// Relations typed only as a record say nothing, so any name passes here and
// `entity()` checks it when the binding is made.
declare const wide: Record<string, RelationBinding>
entity('Project', projects, {
  relations: wide,
  computed: { commentCount: { relation: 'comments' } },
})
