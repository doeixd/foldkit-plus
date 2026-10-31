import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'tsdown'

/** What `src/index.ts` exports the `Entity` namespace as, beside the `Entity` interface. */
const namespaceExport = 'export { EntityMembers as Entity };'

// One file per source module, relative imports left as written: a page then
// keeps only the modules it reads, as from source (#215), and the `Entity`
// namespace stays a namespace, so a page keeps only the members it calls (#378).
// Linked, `sideEffects: false` had nothing to drop, and a namespace became an
// object keeping every member. `scripts/test/publishedBuild.test.ts` and
// `scripts/test/readOnlyPage.test.ts` hold it.
export default defineConfig({
  entry: ['src/**/*.ts'],
  fixedExtension: false,
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: { neverBundle: [/^\.\.?\//, 'effect', 'foldkit-metadata'] },
  hooks: {
    // The declaration bundler drops the namespace's export, which shares its
    // name with the interface, though `tsc` writes both: written back here.
    'build:done': ({ options }) => {
      const file = join(options.outDir, 'index.d.ts')
      if (!existsSync(file)) return
      const text = readFileSync(file, 'utf8')
      if (text.includes(namespaceExport)) return
      if (!text.includes('export interface Entity<'))
        throw new Error('foldkit-entity: index.d.ts no longer declares the Entity interface')
      const [body, map = ''] = text.split(/(?=\/\/# sourceMappingURL=)/)
      writeFileSync(
        file,
        `import * as EntityMembers from "./entity.js";\n${body}${namespaceExport}\n${map}`,
      )
    },
  },
})
