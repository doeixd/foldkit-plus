import { Schema } from 'effect'
import {
  type Document,
  type NodeBlock,
  type NodeId,
  type PropsSchema,
  type RunMark,
} from './document.js'
import { markName, markProps, type MarkDef } from './marks.js'

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

/**
 * A declared application node, with the caller's name and prop schema kept in
 * the type: the erasure to `any` happens only where heterogeneous definitions
 * are collected, not at the authoring call.
 */
export interface NodeDefinitionOf<Name extends string, Props extends PropsSchema | undefined> {
  readonly name: Name
  readonly kind: 'node'
  readonly children: 'text'
  readonly props: Props
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
export const node = <const Name extends string, Props extends PropsSchema | undefined = undefined>(
  name: Name,
  options: { readonly Props?: Props } = {},
): NodeDefinitionOf<Name, Props> => ({
  name,
  kind: 'node',
  children: 'text',
  props: options.Props as Props,
})

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
  readonly code:
    'UnknownNode' | 'UnsupportedNode' | 'UnknownMark' | 'InvalidProps' | 'MismatchedDefinition'
  readonly message: string
  readonly node?: NodeId
  readonly detail?: string
}

/**
 * Whether a declared definition agrees with the block it is declared for: a
 * paragraph is a `block`, an application node is a `node`, and an `atom` says
 * the kind has no children at all.
 */
const definitionMismatch = (
  definition: NodeDefinition,
  shape: 'block' | 'node',
): string | undefined => {
  const declared = definition.kind === 'atom' ? 'atom' : definition.kind
  return declared === shape
    ? undefined
    : `"${definition.name}" is declared as ${declared}, but the document holds it as ${shape}`
}

/**
 * Whether a node's props decode against its declared schema, and why not. The
 * diagnostic is deliberately stable: a schema's own message can name internals
 * an API boundary should not leak, so only the verdict travels.
 */
const propsFailure = (props: PropsSchema | undefined, node: NodeBlock): boolean => {
  if (props === undefined) return false
  try {
    // Strict, like the persisted-content boundary: a field the schema does not
    // declare is a failure, not something silently kept beside the props.
    Schema.decodeUnknownSync(props, { onExcessProperty: 'error' })(node.props)
    return false
  } catch {
    return true
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
 * Whether a mark's props decode against its declared schema, and why not. The
 * same stability rule as node props: only the verdict travels, not a schema's
 * message. A mark that declares props must carry them.
 */
const markPropsFailure = (definition: MarkDef, mark: RunMark): boolean => {
  if (definition.Props === undefined) return false
  try {
    Schema.decodeUnknownSync(definition.Props, { onExcessProperty: 'error' })(markProps(mark))
    return false
  } catch {
    return true
  }
}

/**
 * Checks a document against a Kit's vocabulary without changing it. Reports
 * preserved unknown blocks, known blocks the Kit does not declare, application
 * nodes whose props their schema refuses, and marks outside the Kit or whose
 * props their definition refuses. Content diagnostics never strip or repair the
 * document; callers decide whether to block publishing or surface a placeholder.
 */
export const validate = (document: Document, definition: Kit): ReadonlyArray<Diagnostic> => {
  const byName = new Map(definition.nodes.map(node => [node.name, node]))
  const declaredMarks = new Map(definition.marks.map(mark => [mark.name, mark]))
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
      if (declared === undefined) {
        diagnostics.push({
          code: 'UnsupportedNode',
          node: node.id,
          detail: node.kind,
          message: `The Kit does not declare node "${node.kind}"`,
        })
      } else if (declared.kind !== 'node') {
        diagnostics.push({
          code: 'MismatchedDefinition',
          node: node.id,
          detail: node.kind,
          message: `"${node.kind}" is declared as ${declared.kind}, but the document holds it as node`,
        })
      } else if (propsFailure(declared.props, node)) {
        diagnostics.push({
          code: 'InvalidProps',
          node: node.id,
          detail: node.kind,
          message: `"${node.kind}" props do not match its declared schema`,
        })
      }
    } else {
      const declared = byName.get(node.type)
      if (declared === undefined) {
        diagnostics.push({
          code: 'UnsupportedNode',
          node: node.id,
          detail: node.type,
          message: `The Kit does not declare "${node.type}"`,
        })
      } else {
        // A declaration is a constraint, so it has to agree with what the
        // document holds: an atom says the kind has no children at all.
        const mismatch = definitionMismatch(declared, 'block')
        if (mismatch !== undefined) {
          diagnostics.push({
            code: 'MismatchedDefinition',
            node: node.id,
            detail: node.type,
            message: mismatch,
          })
        }
      }
    }
    for (const run of node.children) {
      for (const mark of run.marks) {
        const name = markName(mark)
        const declared = declaredMarks.get(name)
        if (declared === undefined) {
          diagnostics.push({
            code: 'UnknownMark',
            node: run.id,
            detail: name,
            message: `The Kit does not declare mark "${name}"`,
          })
        } else if (markPropsFailure(declared, mark)) {
          diagnostics.push({
            code: 'InvalidProps',
            node: run.id,
            detail: name,
            message: `"${name}" props do not match its declared schema`,
          })
        }
      }
    }
  }
  return diagnostics
}
