import { Schema } from 'effect'
import { Block, NodeBlock, NodeId, Document } from './document.js'

/**
 * Migrations move semantic data forward when a deployment changes its
 * vocabulary (§73): a preserved node that is now implemented, a prop renamed, a
 * block kind replaced. They operate on blocks, never on DOM, and they run at a
 * boundary the application chooses — loading, publishing, or an explicit
 * upgrade — never automatically on every read.
 *
 * Two rules keep a migration safe to run anywhere:
 *
 * - **Identity survives.** A migration returns the same `id`, so positions,
 *   references, and selections keep addressing the same node.
 * - **Declining is allowed.** Returning `undefined` keeps the block as it is,
 *   which is what a migration does when the data is not its shape after all.
 */
export interface Migration {
  readonly name: string
  /** The type, kind, or preserved `originalType` this migration reads. */
  readonly from: string
  /** The kind it produces, for a report; the returned block is the truth. */
  readonly to?: string | undefined
  readonly migrate: (block: Block) => Block | undefined
}

export interface MigrationApplied {
  readonly name: string
  readonly node: NodeId
}

export interface MigrationReport {
  readonly document: Document
  /** Every block a migration rewrote, in the order it happened. */
  readonly applied: ReadonlyArray<MigrationApplied>
  /** Migrations that found no block of their `from` in this document. */
  readonly unused: ReadonlyArray<string>
}

const matches = (block: Block, from: string): boolean =>
  block.type === 'Unknown'
    ? block.originalType === from
    : block.type === 'Node'
      ? block.kind === from
      : block.type === from

const decodeMigratedDocument = Schema.decodeUnknownSync(Document, { onExcessProperty: 'error' })

/** Declares a migration, checking at construction that it is shaped like one. */
export const migration = (
  name: string,
  from: string,
  migrate: (block: Block) => Block | undefined,
  to?: string,
): Migration => {
  if (name.length === 0) throw new Error('Migration.make: a migration needs a name')
  if (from.length === 0) throw new Error(`Migration "${name}": from must not be empty`)
  return { name, from, migrate, to }
}

/**
 * Runs each migration over every block it reads, in list order. A later
 * migration sees what an earlier one produced, so a chain is expressed by
 * ordering the list. A migration that changes a block's identity is a bug and
 * throws rather than silently breaking every reference to that node.
 */
export const migrate = (
  document: Document,
  migrations: ReadonlyArray<Migration>,
): MigrationReport => {
  const applied: Array<MigrationApplied> = []
  const unused: Array<string> = []
  let next = document
  for (const migration of migrations) {
    let blocks: ReadonlyArray<Block> | undefined
    for (const [index, block] of next.children.entries()) {
      if (!matches(block, migration.from)) continue
      const migrated = migration.migrate(block)
      if (migrated === undefined) continue
      if (migrated.id !== block.id) {
        throw new Error(`Migration "${migration.name}" changed a block's identity`)
      }
      // What a migration returns becomes persisted content, so it must still
      // decode as a block: a migration cannot write non-JSON props or an
      // unknown shape into the document.
      try {
        Schema.decodeUnknownSync(Block, { onExcessProperty: 'error' })(migrated)
      } catch {
        throw new Error(`Migration "${migration.name}" produced an invalid block`)
      }
      blocks ??= [...next.children]
      ;(blocks as Array<Block>)[index] = migrated
      applied.push({ name: migration.name, node: block.id })
    }
    if (blocks === undefined) {
      unused.push(migration.name)
      continue
    }
    next = { ...next, children: blocks }
    try {
      decodeMigratedDocument(next)
    } catch {
      throw new Error(`Migration "${migration.name}" produced an invalid document`)
    }
  }
  return { document: next, applied, unused }
}

/**
 * A migration from a preserved unknown block into a declared node kind: the
 * props are decoded by the target's own schema, and a block whose data does not
 * decode is left alone rather than half-converted.
 */
export const promoteUnknown = (
  name: string,
  from: string,
  to: string,
  Props: Schema.Codec<any, any, never>,
): Migration =>
  migration(
    name,
    from,
    block => {
      if (block.type !== 'Unknown') return undefined
      const decoded = decodeProps(Props, block.props)
      return decoded === undefined
        ? undefined
        : {
            type: 'Node',
            kind: to,
            id: block.id,
            props: decoded,
            children: [],
          }
    },
    to,
  )

const decodeProps = (
  Props: Schema.Codec<any, any, never>,
  props: Readonly<Record<string, unknown>>,
): NodeBlock['props'] | undefined => {
  try {
    const decoded: unknown = Schema.decodeUnknownSync(Props)(props)
    // Persisted props stay JSON: a schema that produces something else is
    // declined rather than written into the document.
    return Schema.decodeUnknownSync(Schema.JsonObject)(decoded)
  } catch {
    return undefined
  }
}

/** A node block's props as the codec stores them: plain JSON, nothing more. */
export const nodeProps = (block: NodeBlock): Readonly<Record<string, unknown>> => block.props
