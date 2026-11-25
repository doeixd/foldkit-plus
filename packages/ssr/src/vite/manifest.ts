/**
 * `Manifest<Tag>` contract and Vite plugin for cutting script along Messages
 * and child machines (Phase 7, Bout 7.3).
 *
 * Every declared Message tag has exactly one chunk home (verified by type and
 * at runtime). `manifestPlugin` absorbs `runtimeChunk` by emitting both the
 * main runtime entry and any per-Message / per-Surface chunks in the client
 * build and exposing their resolved URLs via `virtual:foldkit-ssr-manifest`.
 */
import type { Plugin } from 'vite'

/** One tag's home chunk and any companion chunks (e.g. Command Effects) loaded alongside it. */
export interface ManifestEntry {
  readonly chunk: string
  readonly with: ReadonlyArray<string>
}

/** Exhaustive map from every Message tag in `Tag` to its single chunk home. */
export type Manifest<Tag extends string = string> = {
  readonly [T in Tag]: ManifestEntry
}

/** Compile-time check that a tuple of tag names contains no duplicates. */
export type UniqueTuple<
  T extends ReadonlyArray<string>,
  Seen extends string = never,
> = T extends readonly [infer Head extends string, ...infer Tail extends ReadonlyArray<string>]
  ? Head extends Seen
    ? readonly [`Duplicate tag in manifest: ${Head}`]
    : readonly [Head, ...UniqueTuple<Tail, Seen | Head>]
  : readonly []

/**
 * Construct a verified `Manifest<Tag>` where every tag in `tags` is present
 * exactly once. Fails at compile time if any tag is missing or duplicated in
 * `tags`, and throws at runtime if any tag is duplicated or missing.
 */
export const defineManifest = <const Tags extends ReadonlyArray<string>>(
  tags: Tags & UniqueTuple<Tags>,
  entries: { readonly [T in Tags[number]]: ManifestEntry },
): Manifest<Tags[number]> => {
  const seen = new Set<string>()
  for (const tag of tags) {
    if (seen.has(tag)) {
      throw new Error(`[foldkit-ssr/vite] manifest: duplicate tag "${tag}"`)
    }
    seen.add(tag)
    if (!Object.hasOwn(entries, tag)) {
      throw new Error(`[foldkit-ssr/vite] manifest: missing home for tag "${tag}"`)
    }
  }
  const extra = Object.keys(entries).filter(key => !seen.has(key))
  if (extra.length > 0) {
    throw new Error(`[foldkit-ssr/vite] manifest: unexpected tag(s) "${extra.join(', ')}"`)
  }
  return entries
}

/**
 * Build a `Manifest<Tag>` from chunk groupings `{ chunk, tags, with? }`,
 * refusing any tag claimed by two chunks or any expected tag left unclaimed.
 */
export const manifestFromChunks = <Tag extends string>(
  expectedTags: ReadonlyArray<Tag>,
  chunks: ReadonlyArray<{
    readonly chunk: string
    readonly tags: ReadonlyArray<Tag>
    readonly with?: ReadonlyArray<string> | undefined
  }>,
): Manifest<Tag> => {
  const result: Record<string, ManifestEntry> = Object.create(null)
  const expected = new Set<string>(expectedTags)
  for (const group of chunks) {
    const companion = group.with ?? []
    for (const tag of group.tags) {
      if (!expected.has(tag)) {
        throw new Error(
          `[foldkit-ssr/vite] manifest: unknown tag "${tag}" in chunk "${group.chunk}"`,
        )
      }
      if (Object.hasOwn(result, tag)) {
        throw new Error(
          `[foldkit-ssr/vite] manifest: tag "${tag}" is claimed by both "${result[tag]!.chunk}" and "${group.chunk}"`,
        )
      }
      result[tag] = { chunk: group.chunk, with: companion }
    }
  }
  for (const tag of expectedTags) {
    if (!Object.hasOwn(result, tag)) {
      throw new Error(`[foldkit-ssr/vite] manifest: missing home for tag "${tag}"`)
    }
  }
  return result as Manifest<Tag>
}

const RUNTIME_PLACEHOLDER = /(\bruntimeUrl(?:\s*:\s*string)?\s*=\s*)(['"])foldkit-ssr:runtime-url\2/
const VIRTUAL_ID = 'virtual:foldkit-ssr-manifest'
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`

export interface ManifestPluginOptions<Tag extends string = string> {
  /** The runtime entry module, root-relative (`/src/client/entry.ts`). */
  readonly entry: string
  /** Optional map of Message tags to their chunk entry modules. */
  readonly chunks?: Readonly<
    Record<
      Tag,
      {
        readonly entry: string
        readonly with?: ReadonlyArray<string> | undefined
      }
    >
  >
}

/**
 * Vite plugin that emits the runtime entry chunk (absorbing `runtimeChunk`)
 * and any declared per-Message / per-Surface chunks, exposing the resulting
 * `Manifest` through `virtual:foldkit-ssr-manifest`.
 */
export const manifestPlugin = <Tag extends string = string>(
  options: ManifestPluginOptions<Tag>,
): Plugin => {
  let runtimeRef: string | undefined
  const chunkRefs = new Map<string, { readonly ref: string; readonly withRefs: Array<string> }>()

  return {
    name: 'foldkit-ssr:manifest',
    apply: 'build',
    applyToEnvironment: environment => environment.name === 'client',
    async buildStart() {
      const resolvedRuntime = await this.resolve(options.entry)
      if (resolvedRuntime === null) {
        throw new Error(
          `[foldkit-ssr/vite] manifestPlugin cannot resolve its entry "${options.entry}"`,
        )
      }
      runtimeRef = this.emitFile({ type: 'chunk', id: resolvedRuntime.id })

      if (options.chunks !== undefined) {
        const emittedByModule = new Map<string, string>()
        const emitUnique = async (modulePath: string): Promise<string> => {
          const existing = emittedByModule.get(modulePath)
          if (existing !== undefined) return existing
          const resolved = await this.resolve(modulePath)
          if (resolved === null) {
            throw new Error(
              `[foldkit-ssr/vite] manifestPlugin cannot resolve chunk "${modulePath}"`,
            )
          }
          const ref = this.emitFile({ type: 'chunk', id: resolved.id })
          emittedByModule.set(modulePath, ref)
          return ref
        }

        for (const [tag, spec] of Object.entries(options.chunks) as Array<
          [string, { readonly entry: string; readonly with?: ReadonlyArray<string> | undefined }]
        >) {
          const ref = await emitUnique(spec.entry)
          const withRefs: Array<string> = []
          for (const companion of spec.with ?? []) {
            withRefs.push(await emitUnique(companion))
          }
          chunkRefs.set(tag, { ref, withRefs })
        }
      }
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
      return null
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null
      const entries = Array.from(chunkRefs.entries()).map(([tag, { ref, withRefs }]) => {
        const withArr = withRefs.map(r => `import.meta.ROLLUP_FILE_URL_${r}`).join(', ')
        return `  ${JSON.stringify(tag)}: { chunk: import.meta.ROLLUP_FILE_URL_${ref}, with: [${withArr}] }`
      })
      return `export const manifest = {\n${entries.join(',\n')}\n}\n`
    },
    transform(code) {
      if (runtimeRef === undefined || !RUNTIME_PLACEHOLDER.test(code)) return null
      return {
        code: code.replace(RUNTIME_PLACEHOLDER, `$1import.meta.ROLLUP_FILE_URL_${runtimeRef}`),
        map: null,
      }
    },
  }
}
