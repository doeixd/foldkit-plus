import { isStateCompletion } from './completion.js'
import type { Definition } from './make.js'
import { contextSchema, messages, resources } from './introspect.js'
import { messageTags } from './tag.js'
import type { Parts } from './parts.js'
import { Option } from 'effect'

/**
 * The agent contract as a self-contained document.
 *
 * Written to `agent.json` and committed, it makes a change to what an
 * application exposes visible in review rather than only at runtime.
 */
export interface Manifest {
  readonly capabilities: ReadonlyArray<{
    readonly name: string
    readonly tag: string
    readonly description: string
    readonly inputSchema: Record<string, unknown>
    readonly modelDependent: boolean
    readonly requiresAuthorization: boolean
    readonly inputDependent: boolean
    readonly completion?:
      | {
          readonly kind: 'message'
          readonly success: ReadonlyArray<string>
          readonly failure?: ReadonlyArray<string>
        }
      /** `observes` are the Model paths a projection reads; empty for a source. */
      | { readonly kind: 'state'; readonly observes: ReadonlyArray<string> }
  }>
  readonly resources: ReadonlyArray<{
    readonly name: string
    readonly description: string
    readonly schema: Record<string, unknown>
  }>
  readonly context?: Record<string, unknown>
  /** The parts given to `toManifest`, in declaration order. */
  readonly parts?: ReadonlyArray<{
    readonly id: string
    readonly role: string
    /** Present when the label is text; a repeated part's may be worked out per item. */
    readonly label?: string
    /** The name of the capability the part invokes or sets. */
    readonly capability?: string
    /** The context key the part shows. */
    readonly field?: string
    readonly repeated: boolean
  }>
}

/**
 * Describes a contract as data, in declaration order and with nothing derived
 * from the current run.
 *
 * The output is reproducible for a given contract, so it can be committed and
 * diffed. Nothing here reads the Model.
 */
export const toManifest = (
  definition: Definition<any, any, any, any, any>,
  parts?: Parts<any>,
): Manifest => {
  if (parts !== undefined && parts.definition !== definition) {
    throw new Error('Agent.toManifest: the parts were declared for another definition')
  }
  const context = contextSchema(definition)
  const nameOf = new Map(definition.messages.variants.map(variant => [variant.tag, variant.name]))

  return {
    capabilities: messages(definition).map(capability => {
      const completion = capability.completion

      return {
        name: capability.name,
        tag: capability.tag,
        description: capability.description,
        inputSchema: capability.inputSchema,
        modelDependent: capability.modelDependent,
        requiresAuthorization: capability.requiresAuthorization,
        inputDependent: capability.inputDependent,
        ...(completion === undefined
          ? {}
          : {
              completion: isStateCompletion(completion)
                ? {
                    kind: 'state' as const,
                    observes: completion.projection?.dependencies.map(path => path.join('.')) ?? [],
                  }
                : {
                    kind: 'message' as const,
                    success: messageTags(completion.success),
                    ...(completion.failure === undefined
                      ? {}
                      : { failure: messageTags(completion.failure) }),
                  },
            }),
      }
    }),
    resources: resources(definition).map(resource => ({
      name: resource.name,
      description: resource.description,
      schema: resource.schema,
    })),
    ...(context === undefined ? {} : { context }),
    ...(parts === undefined
      ? {}
      : {
          parts: parts.compiled.map(declared => ({
            id: declared.id,
            role: declared.role,
            ...(typeof declared.label === 'string' ? { label: declared.label } : {}),
            ...Option.match(declared.tag, {
              onNone: () => ({}),
              onSome: tag => ({ capability: nameOf.get(tag)! }),
            }),
            ...Option.match(declared.field, {
              onNone: () => ({}),
              onSome: field => ({ field }),
            }),
            repeated: Option.isSome(declared.each),
          })),
        }),
  }
}

const jsonBlock = (value: unknown): string => '```json\n' + JSON.stringify(value, null, 2) + '\n```'

const yesNo = (value: boolean): string => (value ? 'yes' : 'no')

/** Escapes the characters that would break out of a Markdown table cell. */
const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')

/**
 * Renders a contract as Markdown, from the same descriptors adapters read.
 *
 * @example
 * ```ts
 * writeFileSync('AGENT.md', Agent.toMarkdown(AppAgent))
 * ```
 */
export const toMarkdown = (definition: Definition<any, any, any, any, any>): string => {
  const manifest = toManifest(definition)
  const lines: Array<string> = ['# Agent contract', '']

  if (manifest.capabilities.length === 0) {
    lines.push('This contract exposes no capabilities.', '')
  } else {
    lines.push(
      '## Capabilities',
      '',
      '| Name | Message | Description | Model-dependent | Authorized |',
      '| --- | --- | --- | --- | --- |',
    )
    for (const capability of manifest.capabilities) {
      lines.push(
        `| \`${cell(capability.name)}\` | \`${cell(capability.tag)}\` | ${cell(
          capability.description,
        )} | ${yesNo(capability.modelDependent)} | ${yesNo(capability.requiresAuthorization)} |`,
      )
    }
    lines.push('')

    for (const capability of manifest.capabilities) {
      lines.push(`### \`${capability.name}\``, '', capability.description, '')
      if (capability.modelDependent) {
        lines.push('Available only in some Model states.', '')
      }
      if (capability.requiresAuthorization) {
        lines.push('Runs an authorization check before dispatching.', '')
      }
      if (capability.inputDependent) {
        lines.push('Refused for some inputs, judged after authorization.', '')
      }
      lines.push('Input:', '', jsonBlock(capability.inputSchema), '')
      const completion = capability.completion
      if (completion?.kind === 'state') {
        const observes = completion.observes.map(path => `\`${path}\``).join(', ')
        lines.push(
          `Completes when application state${observes === '' ? '' : ` (${observes})`} satisfies its condition.`,
          '',
        )
      } else if (completion?.kind === 'message') {
        const success = completion.success.join(', ')
        const failure = completion.failure?.join(', ')
        lines.push(
          `Completes on \`${success}\`${failure === undefined ? '' : `, fails on \`${failure}\``}.`,
          '',
        )
      }
    }
  }

  if (manifest.resources.length > 0) {
    lines.push('## Resources', '')
    for (const resource of manifest.resources) {
      lines.push(
        `### \`${resource.name}\``,
        '',
        resource.description,
        '',
        jsonBlock(resource.schema),
        '',
      )
    }
  }

  lines.push('## Context', '')
  lines.push(
    manifest.context === undefined
      ? 'This contract projects no Model context.'
      : jsonBlock(manifest.context),
    '',
  )

  return lines.join('\n')
}
