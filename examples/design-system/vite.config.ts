import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'
// From source, by path: a config runs in Node, past the source condition.
import { styles } from '../../packages/mixins/src/vite.ts'

export default defineConfig({
  // Foldkit's view identity for the differ, and the Model kept across a dev reload.
  plugins: [
    // `style.ts` ships as the classes it compiles to, not the compiler (#420).
    styles({ sheet: '/src/sheet.ts', modules: ['/src/style.ts'] }),
    foldkit(),
  ],
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  // The sheet is evaluated in a server-style build, which has conditions of its own.
  ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
  server: { host: '127.0.0.1' },
})
