import { Schema } from 'effect'
import { Mark, type Document, type NodeBlock, type NodeId } from './document.js'
import type { MarkDef } from './marks.js'

/** A schema this version can hand to `decodeUnknownSync` at the Kit boundary. */
type PropsSchema = Schema.Codec<any, any, never>

/**
 * The node shapes this version can declare: a block holds runs, an atom holds
 * nothing, and an application node holds runs plus props its own schema
 * validates. Nesting children beyond runs arrives with the node work.
 */
export type NodeDefinition =
  | { readonly name: string; readonly kind: 'block'; readonly children: 'text' }
  | { readonly name: string; readonly kind: 'atom'; readonly children: 'none' }
  | {
      readonly name: string
      readonly kind: 'node'
      readonly children: 'text'
      /** Validates a `Node` block's `props` at this boundary, not in the codec. */
      readonly props?: PropsSchema | undefined
    }

/** Declares a block node kind: a top-level node containing text runs. */
export const block = (name: string): NodeDefinition => ({
  name,
  kind: 'block',
  children: 'text',
})

/** Declares an atom: an addressable node with no text content. */
export const atom = (name: string): NodeDefinition => ({ name, kind: 'atom', children: 'none' })

/**
 * Declares an application node kind: a `Node` block whose props this schema
 * validates. The document codec keeps those props as JSON; the Kit is where an
 * application's types meet them.
 */
export const node = (
  name: string,
  options: { readonly Props?: PropsSchema | undefined } = {},
): NodeDefinition => ({ name, kind: 'node', children: 'text', props: options.Props })

/**
 * The vocabulary one editor accepts: which node kinds and marks are available.
 * A Kit is a definition, never document state, and it never holds renderers or
 * executable code. Nested children, transforms, and metadata arrive later.
 */
export interface Kit {
  readonly nodes: ReadonlyArray<NodeDefinition>
  /** Mark definitions, not just names: a Kit carries each mark's boundary policy. */
  readonly marks: ReadonlyArray<MarkDef>
}

export const kit = (definition: {
  readonly nodes: ReadonlyArray<NodeDefinition>
  readonly marks: ReadonlyArray<MarkDef>
}): Kit => Object.freeze({ nodes: [...definition.nodes], marks: [...definition.marks] })

export interface Diagnostic {
  readonly code: 'UnknownNode' | 'UnsupportedNode' | 'UnknownMark' | 'InvalidProps'
  readonly message: string
  readonly node?: NodeId
  readonly detail?: string
}

/** Whether a node's props decode against its declared schema, and why not. */
const propsFailure = (props: PropsSchema | undefined, node: NodeBlock): string | undefined => {
  if (props === undefined) return undefined
  try {
    Schema.decodeUnknownSync(props)(node.props)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : 'props do not match the schema'
  }
}

/** Structural summary of a Kit, for tooling and tests. */
export const inspectKit = (definition: Kit) => ({
  blocks: definition.nodes.filter(node => node.kind === 'block').length,
  atoms: definition.nodes.filter(node => node.kind === 'atom').length,
  nodes: definition.nodes.filter(node => node.kind === 'node').length,
  marks: definition.marks.length,
})

/**
 * Checks a document against a Kit's vocabulary without changing it. Reports
 * preserved unknown blocks, known blocks the Kit does not declare, application
 * nodes whose props their schema refuses, and marks outside the Kit. Content
 * diagnostics never strip or repair the document; callers decide whether to
 * block publishing or surface a placeholder.
 */
export const validate = (document: Document, definition: Kit): ReadonlyArray<Diagnostic> => {
  const byName = new Map(definition.nodes.map(node => [node.name, node]))
  const declaredMarks = new Set<string>(definition.marks.map(mark => mark.name))
  const diagnostics: Array<Diagnostic> = []
  for (const node of document.children) {
    if (node.type === 'Unknown') {
      diagnostics.push({
        code: 'UnknownNode',
        node: node.id,
        detail: node.originalType,
        message: `Unimplemented node type "${node.originalType}"`,
      })
    } else if (node.type === 'Node') {
      const declared = byName.get(node.kind)
      if (declared?.kind !== 'node') {
        diagnostics.push({
          code: 'UnsupportedNode',
          node: node.id,
          detail: node.kind,
          message: `The Kit does not declare node "${node.kind}"`,
        })
      } else {
        const failure = propsFailure(declared.props, node)
        if (failure !== undefined) {
          diagnostics.push({
            code: 'InvalidProps',
            node: node.id,
            detail: node.kind,
            message: `"${node.kind}" props are invalid: ${failure}`,
          })
        }
      }
    } else if (!byName.has(node.type)) {
      diagnostics.push({
        code: 'UnsupportedNode',
        node: node.id,
        detail: node.type,
        message: `The Kit does not declare "${node.type}"`,
      })
    }
    for (const run of node.children) {
      for (const mark of run.marks) {
        if (declaredMarks.has(mark)) continue
        diagnostics.push({
          code: 'UnknownMark',
          node: run.id,
          detail: mark,
          message: `The Kit does not declare mark "${mark}"`,
        })
      }
    }
  }
  return diagnostics
}
