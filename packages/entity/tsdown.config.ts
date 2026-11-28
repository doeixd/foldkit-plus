import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'tsdown'

/**
 * The namespaces `src/index.ts` exports beside an interface of the same name
 * (`Entity`, `Expr`, `Query`), each with the module it is made of.
 */
const namespaces = [
  { members: 'EntityMembers', name: 'Entity', from: './entity.js' },
  { members: 'ExprMembers', name: 'Expr', from: './expr/exprMembers.js' },
  { members: 'QueryMembers', name: 'Query', from: './expr/queryMembers.js' },
] as const

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
  deps: { neverBundle: [/^\.\.?\//, /^metakit(\/.*)?$/, 'effect', 'foldkit-metadata'] },
  hooks: {
    // The declaration bundler drops a namespace's export that shares its name
    // with an interface, though `tsc` writes both: written back here.
    'build:done': ({ options }) => {
      const file = join(options.outDir, 'index.d.ts')
      if (!existsSync(file)) return
      let [body, map = ''] = readFileSync(file, 'utf8').split(/(?=\/\/# sourceMappingURL=)/)
      for (const { members, name, from } of namespaces) {
        const exported = `export { ${members} as ${name} };`
        if (body!.includes(exported)) continue
        if (!body!.includes(`export interface ${name}<`))
          throw new Error(`foldkit-entity: index.d.ts no longer declares the ${name} interface`)
        body = `import * as ${members} from "${from}";\n${body}${exported}\n`
      }
      writeFileSync(file, `${body}${map}`)
    },
  },
})
