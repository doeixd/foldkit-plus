import { Schema } from 'effect'
import {
  blockContent,
  eachBlock,
  textContent,
  type Block,
  type ContentMode,
  type Document,
  type NodeBlock,
  type NodeId,
  type PropsSchema,
  type RunMark,
} from './document.js'
import { markName, markProps, type MarkDef } from './marks.js'

/**
 * The node shapes this version can declare: a `block` is one of the built-in
 * text blocks, an `atom` is an addressable node holding nothing, and an
 * application `node` holds runs or nested blocks plus props its own schema
 * validates (§13).
 */
export type NodeDefinition =
  | { readonly name: string; readonly kind: 'block'; readonly children: 'text' }
  | { readonly name: string; readonly kind: 'atom'; readonly children: 'none' }
  | {
      readonly name: string
      readonly kind: 'node'
      /** `textContent` holds runs; `blockContent` holds nested blocks, as a list needs. */
      readonly children: ContentMode
      /** Validates a `Node` block's `props` at this boundary, not in the codec. */
      readonly props?: PropsSchema | undefined
    }

/**
 * A declared application node, with the caller's name, prop schema, and content
 * mode kept in the type: the erasure to `any` happens only where heterogeneous
 * definitions are collected, not at the authoring call.
 */
export interface NodeDefinitionOf<
  Name extends string,
  Props extends PropsSchema | undefined,
  Children extends ContentMode = typeof textContent,
> {
  readonly name: Name
  readonly kind: 'node'
  readonly children: Children
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
 * validates and whose content the `children` mode declares. The document codec
 * keeps those props as JSON; the Kit is where an application's types meet them.
 */
export const node = <
  const Name extends string,
  Props extends PropsSchema | undefined = undefined,
  Children extends ContentMode = typeof textContent,
>(
  name: Name,
  options: { readonly Props?: Props; readonly children?: Children } = {},
): NodeDefinitionOf<Name, Props, Children> => ({
  name,
  kind: 'node',
  children: (options.children ?? textContent) as Children,
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

/** Whether a block is held as a built-in block or as an application node. */
const heldShape = (block: Block): 'block' | 'node' => (block.type === 'Node' ? 'node' : 'block')

/**
 * The content a block actually holds. An empty application node is `either`: the
 * document cannot say whether it is an atom or a run holder that happens to have
 * no runs, so a declaration of either kind agrees with it.
 */
const heldContent = (block: Block): 'text' | 'blocks' | 'either' => {
  if (block.type !== 'Node') return 'text'
  if (block.blocks !== undefined) return 'blocks'
  return block.children.length > 0 ? 'text' : 'either'
}

/**
 * Whether a declared definition agrees with the block it is declared for, and
 * why not. A `block` declaration expects a built-in block and a `node` or `atom`
 * one expects an application node; then the declared content mode must match what
 * the block holds, which is what makes an atom's no-children rule real.
 */
const definitionMismatch = (definition: NodeDefinition, block: Block): string | undefined => {
  const expected = definition.kind === 'block' ? 'block' : 'node'
  const held = heldShape(block)
  if (held !== expected) {
    return `"${definition.name}" is declared as ${definition.kind}, but the document holds it as ${held}`
  }
  const declared = definition.kind === 'atom' ? 'none' : definition.children
  const content = heldContent(block)
  const agrees = content === 'either' ? declared !== 'blocks' : declared === content
  return agrees
    ? undefined
    : `"${definition.name}" is declared to hold ${declared}, but the document holds ${content}`
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
 * Checks a document against a Kit's vocabulary without changing it, walking
 * nested blocks so a container's children are checked too. Reports preserved
 * unknown blocks, known blocks the Kit does not declare, declarations that
 * disagree with how the document holds a block, application nodes whose props
 * their schema refuses, and marks outside the Kit or whose props their definition
 * refuses. Content diagnostics never strip or repair the document; callers decide
 * whether to block publishing or surface a placeholder.
 */
export const validate = (document: Document, definition: Kit): ReadonlyArray<Diagnostic> => {
  const byName = new Map(definition.nodes.map(node => [node.name, node]))
  const declaredMarks = new Map(definition.marks.map(mark => [mark.name, mark]))
  const diagnostics: Array<Diagnostic> = []
  eachBlock(document.children, block => {
    if (block.type === 'Unknown') {
      diagnostics.push({
        code: 'UnknownNode',
        node: block.id,
        detail: block.originalType,
        message: `Unimplemented node type "${block.originalType}"`,
      })
    } else if (block.type === 'Node') {
      const declared = byName.get(block.kind)
      if (declared === undefined) {
        diagnostics.push({
          code: 'UnsupportedNode',
          node: block.id,
          detail: block.kind,
          message: `The Kit does not declare node "${block.kind}"`,
        })
      } else {
        const mismatch = definitionMismatch(declared, block)
        if (mismatch !== undefined) {
          diagnostics.push({
            code: 'MismatchedDefinition',
            node: block.id,
            detail: block.kind,
            message: mismatch,
          })
        } else if (propsFailure(declared.kind === 'node' ? declared.props : undefined, block)) {
          diagnostics.push({
            code: 'InvalidProps',
            node: block.id,
            detail: block.kind,
            message: `"${block.kind}" props do not match its declared schema`,
          })
        }
      }
    } else {
      const declared = byName.get(block.type)
      if (declared === undefined) {
        diagnostics.push({
          code: 'UnsupportedNode',
          node: block.id,
          detail: block.type,
          message: `The Kit does not declare "${block.type}"`,
        })
      } else {
        const mismatch = definitionMismatch(declared, block)
        if (mismatch !== undefined) {
          diagnostics.push({
            code: 'MismatchedDefinition',
            node: block.id,
            detail: block.type,
            message: mismatch,
          })
        }
      }
    }
    for (const run of block.children) {
      for (const mark of run.marks) {
        const name = markName(mark)
        const declaredMark = declaredMarks.get(name)
        if (declaredMark === undefined) {
          diagnostics.push({
            code: 'UnknownMark',
            node: run.id,
            detail: name,
            message: `The Kit does not declare mark "${name}"`,
          })
        } else if (markPropsFailure(declaredMark, mark)) {
          diagnostics.push({
            code: 'InvalidProps',
            node: run.id,
            detail: name,
            message: `"${name}" props do not match its declared schema`,
          })
        }
      }
    }
  })
  return diagnostics
}
