/**
 * A style module evaluated at build, written back as data (#420): what
 * `foldkit-mixins/vite` ships in place of a module named in `modules`. Each
 * Style keeps its name and a Mixin of the classes and inline declarations it
 * compiled to, a Slot contract its Slots, a token object its strings, so the
 * browser imports `Mixin` and `Slots` and none of the compiler. What cannot be
 * written as data fails the build here, naming the export.
 *
 * A `Style.whenInput` is written as data too, its predicate kept as the import
 * it was (`importsRecorded`). The condition's classes are compiled here, so
 * only the choice among them is made in the page.
 *
 * Values are recognized by shape and by registered symbols, never by
 * `instanceof`: the module was evaluated in a bundle of its own, with its
 * own copy of this package.
 */

import type { Plugin } from 'vite'
import * as Rules from './styleRules.js'
import type { StyleRule } from './styleRules.js'

/** A compiled class: what the emitted sheet must hold a rule for. */
const COMPILED = /^style-[0-9a-z]+$/

const SLOT = Symbol.for('foldkit-mixins/Slot')
const TOKEN = Symbol.for('foldkit-mixins/MetadataToken')
const IMPORTS = Symbol.for('foldkit-mixins/FrozenImports')

/** Where a function a listed module imported came from, as the module wrote it. */
interface ImportedFrom {
  readonly from: string
  readonly name: string
  /** The imported module is itself in `modules`, so its exports are data and the predicate is not kept. */
  readonly listed: boolean
}

const imported = (value: unknown): ImportedFrom | undefined =>
  ((globalThis as { [IMPORTS]?: WeakMap<object, ImportedFrom> })[IMPORTS] ?? new WeakMap()).get(
    value as object,
  )

const quote = (value: unknown): string => JSON.stringify(value)

/**
 * The sheet build's hook on each listed module: after its code, every named
 * import that is a function is recorded by identity with the specifier it came
 * from. A `whenInput` predicate is a function value by the time the module is
 * evaluated, and this is the only way back to the import that made it.
 */
export const importsRecorded = (modules: ReadonlyArray<string>): Plugin => {
  const listed = new Set<string>()
  return {
    name: 'foldkit-mixins:record-imports',
    enforce: 'post',
    async buildStart() {
      listed.clear()
      for (const id of modules) {
        const resolved = await this.resolve(id)
        if (resolved !== null) listed.add(resolved.id)
      }
    },
    async transform(code, id) {
      if (!listed.has(id)) return undefined
      const records: Array<string> = []
      for (const node of this.parse(code).body) {
        if (node.type !== 'ImportDeclaration') continue
        const from = String(node.source.value)
        const target = await this.resolve(from, id)
        const inModules = target !== null && listed.has(target.id)
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue
          const name =
            'name' in specifier.imported ? specifier.imported.name : specifier.imported.value
          records.push(
            `[${specifier.local.name}, ${quote({ from, name: String(name), listed: inModules })}]`,
          )
        }
      }
      if (records.length === 0) return undefined
      return {
        code: `${code}
;(() => {
  const key = Symbol.for(${quote('foldkit-mixins/FrozenImports')})
  const known = (globalThis[key] ??= new WeakMap())
  for (const [value, from] of [${records.join(', ')}]) if (typeof value === 'function') known.set(value, from)
})()
`,
        map: null,
      }
    },
  }
}

/** The properties of a `NamedStyle` a frozen one no longer has: they hold the compiler's output. */
const DROPPED = ['pieces', 'css', 'globalCss', 'rules', 'globalRules'] as const

export interface FrozenModule {
  /** The module's source, for the browser build. */
  readonly source: string
  /** Every compiled class it draws, each of which the sheet must hold. */
  readonly classes: ReadonlySet<string>
}

const fail = (id: string, message: string): never => {
  throw new Error(
    `foldkit-mixins/vite: "${id}" is in \`modules\`, so it is evaluated at build; ${message}`,
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

interface Token {
  readonly kind: string
  readonly name: string
  readonly extends?: ReadonlyArray<unknown>
}

const isToken = (value: unknown): value is Token =>
  typeof value === 'object' && value !== null && Object.hasOwn(value, TOKEN)

/** A Style's piece for one Slot, as it was placed and before its rules were compiled to classes. */
interface PieceShape {
  readonly classes: ReadonlyArray<string>
  readonly style: Readonly<Record<string, string>>
  readonly rules?: ReadonlyArray<StyleRule>
  readonly conditions?: ReadonlyArray<{
    readonly predicate: (input: unknown) => boolean
    readonly piece: PieceShape
  }>
  readonly items?: ReadonlyArray<unknown>
}

const hasItems = (piece: PieceShape): boolean =>
  (piece.items ?? []).length > 0 || (piece.conditions ?? []).some(c => hasItems(c.piece))

interface NamedStyleShape {
  readonly name?: string
  readonly pieces: Record<string, PieceShape | undefined>
  readonly mixin: { readonly name: string; readonly contributions: Record<string, unknown> }
}

const isNamedStyle = (value: unknown): value is NamedStyleShape =>
  isRecord(value) &&
  isRecord(value['pieces']) &&
  Array.isArray(value['rules']) &&
  Array.isArray(value['globalRules']) &&
  isRecord(value['mixin']) &&
  isRecord(value['mixin']['contributions'])

interface DeclaredShape {
  readonly slots: Record<string, Record<PropertyKey, unknown>>
  readonly style: NamedStyleShape
}

const isDeclared = (value: unknown): value is DeclaredShape =>
  isRecord(value) &&
  Object.keys(value).length === 2 &&
  isNamedStyle(value['style']) &&
  typeof value['slots'] === 'object' &&
  value['slots'] !== null &&
  Object.values(value['slots']).every(
    slot => typeof slot === 'object' && slot !== null && Object.hasOwn(slot, SLOT),
  )

/** `t` and its groups: objects whose leaves are strings. */
const isStrings = (value: unknown): boolean =>
  typeof value === 'string' || (isRecord(value) && Object.values(value).every(isStrings))

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const literal = (value: unknown): string => JSON.stringify(value)
const exportName = (name: string): string => (IDENTIFIER.test(name) ? name : literal(name))

/** The module's text, built declaration by declaration so shared values are written once. */
class Writer {
  readonly lines: Array<string> = []
  readonly classes = new Set<string>()
  /** The predicates a module imported, written as the imports they were. */
  readonly imports: Array<string> = []
  private readonly predicates = new Map<string, string>()
  private readonly named = new Map<string, string>()

  constructor(readonly id: string) {}

  /** A declaration for `key`, written once and named by its order. */
  private declare(key: string, expression: () => string): string {
    const found = this.named.get(key)
    if (found !== undefined) return found
    const name = `$${this.named.size}`
    // Parents first: `expression` may declare what it reads.
    const text = expression()
    this.named.set(key, name)
    this.lines.push(`const ${name} = ${text}`)
    return name
  }

  /** A capability, event, attribute or requirement as the module rebuilds it. */
  token(value: unknown): string {
    if (typeof value === 'string') return literal(value)
    if (!isToken(value)) return fail(this.id, `a Slot names ${String(value)}, which is no token`)
    if (value.kind !== 'element.capability') {
      return this.declare(
        `token:${value.kind}:${value.name}`,
        () => `MetadataToken.make(${literal(value.kind)}, ${literal(value.name)})`,
      )
    }
    // A capability's parents are registered before it, so `extendsCapability` walks them.
    const parents = (value.extends ?? []).map(parent => this.token(parent))
    return this.declare(
      `capability:${value.name}`,
      () => `Capability.make(${literal(value.name)}, { extends: [${parents.join(', ')}] })`,
    )
  }

  private tokens(values: unknown): string {
    return `[${(Array.isArray(values) ? values : []).map(value => this.token(value)).join(', ')}]`
  }

  private slot(slot: Record<PropertyKey, unknown>): string {
    const protection = isRecord(slot['protected']) ? slot['protected'] : {}
    const options = [
      `capability: ${this.token(slot['capability'])}`,
      `events: ${this.tokens(slot['events'])}`,
      `attributes: ${this.tokens(slot['attributes'])}`,
      `requirements: ${this.tokens(slot['requirements'])}`,
      `hidden: ${slot['hidden'] === true}`,
      `protected: { events: ${this.tokens(protection['events'])}, attributes: ${this.tokens(protection['attributes'])}, style: ${literal(protection['style'] ?? [])} }`,
    ].join(', ')
    return this.declare(`slot:${options}`, () => `{ ${options} }`)
  }

  slots(contract: DeclaredShape['slots']): string {
    const entries = Object.getOwnPropertyNames(contract).map(
      key => `${literal(key)}: ${this.slot(contract[key] ?? {})}`,
    )
    return `Slots.define({ ${entries.join(', ')} })`
  }

  /** A predicate as the import it was; anything else cannot cross to the page. */
  private predicate(
    exported: string,
    slot: string,
    predicate: (input: unknown) => boolean,
  ): string {
    const found = imported(predicate)
    const where = `its export "${exported}" styles slot "${slot}" with`
    if (found === undefined)
      return fail(
        this.id,
        `${where} Style.whenInput and a predicate that is not imported. Move the predicate to a module of its own that is not listed, and import it by name.`,
      )
    if (found.listed)
      return fail(
        this.id,
        `${where} a predicate imported from ${quote(found.from)}, which is itself in \`modules\`, so its exports are data. Move the predicate to a module that is not listed.`,
      )
    const key = quote([found.from, found.name])
    const known = this.predicates.get(key)
    if (known !== undefined) return known
    const local = `$predicate${this.predicates.size}`
    this.predicates.set(key, local)
    this.imports.push(`import { ${found.name} as ${local} } from ${quote(found.from)}`)
    return local
  }

  /** A piece as `{ classes, style, conditions }`, its rules already the classes the sheet holds. */
  private piece(exported: string, slot: string, piece: PieceShape): string {
    const rules = piece.rules ?? []
    const generated = rules.length === 0 ? undefined : Rules.className(rules)
    const classes = generated === undefined ? piece.classes : [...piece.classes, generated]
    for (const name of classes) if (COMPILED.test(name)) this.classes.add(name)
    const conditions = (piece.conditions ?? []).map(
      condition =>
        `{ when: ${this.predicate(exported, slot, condition.predicate)}, piece: ${this.piece(exported, slot, condition.piece)} }`,
    )
    return `{ classes: ${quote(classes)}, style: ${quote(piece.style)}, conditions: [${conditions.join(', ')}] }`
  }

  style(exported: string, style: NamedStyleShape): string {
    const contributions = Object.entries(style.mixin.contributions).map(([slot, contribution]) => {
      if (typeof contribution === 'function') {
        const piece = style.pieces[slot]
        if (piece === undefined || hasItems(piece))
          return fail(
            this.id,
            `its export "${exported}" styles slot "${slot}" with Style.perItem, which chooses classes for each item as it is drawn, so it needs the compiler in the page. Leave the module off \`modules\` to keep it on the run-time path.`,
          )
        return `${quote(slot)}: conditional(${this.piece(exported, slot, piece)})`
      }
      const { classes, style: inline } = (contribution ?? {}) as {
        readonly classes?: ReadonlyArray<string>
        readonly style?: Readonly<Record<string, string>>
      }
      for (const name of classes ?? []) if (COMPILED.test(name)) this.classes.add(name)
      const declarations = Object.keys(inline ?? {}).length === 0 ? '' : `, ${literal(inline)}`
      return `${literal(slot)}: frozen(${literal(classes ?? [])}${declarations})`
    })
    return `named(${literal(exported)}, ${literal(style.name ?? null)}, ${literal(style.mixin.name)}, { ${contributions.join(', ')} })`
  }
}

/** The header every frozen module carries: the two constructors its values are written with. */
const HEADER = `import { Capability, MetadataToken, Mixin, Slots } from 'foldkit-mixins'
const none = Object.freeze(Object.create(null))
const frozen = (classes, style) => Object.freeze({ classes: Object.freeze(classes), style: style === undefined ? none : Object.freeze(Object.assign(Object.create(null), style)) })
const resolved = (piece, input) => {
  const active = piece.conditions.filter(condition => condition.when(input)).map(condition => resolved(condition.piece, input))
  return { classes: [...piece.classes, ...active.flatMap(next => next.classes)], style: Object.assign(Object.create(null), piece.style, ...active.map(next => next.style)) }
}
const conditional = piece => context => { const drawn = resolved(piece, context.input); return frozen(drawn.classes, drawn.style) }
const named = (exported, name, mixinName, contributions) => {
  const style = { mixin: Mixin.dynamic(mixinName, contributions) }
  if (name !== null) style.name = name
  for (const key of ${literal(DROPPED)}) Object.defineProperty(style, key, { get() { throw new Error(\`\${exported}.\${key} is not kept: its module is listed in the modules of foldkit-mixins/vite, which keeps each style's name and Mixin\`) } })
  return Object.freeze(style)
}`

/**
 * `namespace`, the module `id` evaluated, as source: each export a
 * `NamedStyle`, a `Style.slots` declaration, a string, or an object of strings
 * (a token reference object). Anything else fails the build, as does a
 * `whenInput` whose predicate is not an import from a module off the list, and
 * any `perItem`.
 */
export const freeze = (id: string, namespace: Readonly<Record<string, unknown>>): FrozenModule => {
  const writer = new Writer(id)
  const exports: Array<string> = []
  for (const [name, value] of Object.entries(namespace)) {
    const expression = isNamedStyle(value)
      ? writer.style(name, value)
      : isDeclared(value)
        ? `Object.freeze({ slots: ${writer.slots(value.slots)}, style: ${writer.style(`${name}.style`, value.style)} })`
        : isStrings(value)
          ? literal(value)
          : fail(
              id,
              `its export "${name}" is not a Style, a \`Style.slots\` declaration, a string or an object of strings, so it cannot be written as data. Move it to a module that is not listed.`,
            )
    const local = `$export${exports.length}`
    writer.lines.push(`const ${local} = ${expression}`)
    exports.push(`${local} as ${exportName(name)}`)
  }
  return {
    source: [
      HEADER,
      ...writer.imports,
      ...writer.lines,
      `export { ${exports.join(', ')} }`,
      '',
    ].join('\n'),
    classes: writer.classes,
  }
}

/** Fails the build when a frozen module draws a compiled class the emitted sheet has no rule for. */
export const assertRules = (frozen: ReadonlyMap<string, FrozenModule>, css: string): void => {
  const held = new Set(Array.from(css.matchAll(/\.(style-[0-9a-z]+)/g), ([, name]) => name))
  for (const [id, module] of frozen) {
    const missing = [...module.classes].filter(name => !held.has(name))
    if (missing.length > 0) {
      throw new Error(
        `foldkit-mixins/vite: "${id}" draws ${missing.map(name => `"${name}"`).join(', ')}, which the stylesheet has no rule for`,
      )
    }
  }
}
