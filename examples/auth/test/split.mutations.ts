/**
 * Yielded's client, pulled back into the entry chunk two ways:
 * `pnpm mutate examples/auth/test/split.mutations.ts`.
 */
const tests = ['examples/auth/test/split.test.ts']

export default [
  {
    name: 'the client is imported statically',
    edits: [
      {
        file: '../src/client.ts',
        find: "import { view } from './view.js'\n",
        replace: "import { view } from './view.js'\nimport { layer } from './authClient.js'\n",
      },
      {
        file: '../src/client.ts',
        find: "Resource.lazy(AppClient, () => import('./authClient.js').then(chunk => chunk.layer)),",
        replace: 'Resource.lazy(AppClient, async () => layer),',
      },
    ],
    tests,
  },
  {
    name: 'the contract is re-exported from the shared domain module',
    edits: [
      {
        file: '../src/domain.ts',
        find: "import { Schema } from 'effect'\n",
        replace: "import { Schema } from 'effect'\nexport { AuthApi } from './authApi.js'\n",
      },
    ],
    tests,
  },
]
