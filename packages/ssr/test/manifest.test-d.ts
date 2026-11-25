import { defineManifest, type Manifest } from '../src/vite/manifest.js'

// Positive: every tag has one home
const good: Manifest<'Add' | 'Remove'> = defineManifest(['Add', 'Remove'], {
  Add: { chunk: '/assets/add.js', with: [] },
  Remove: { chunk: '/assets/remove.js', with: [] },
})
void good

// Negative 1: missing tag fails to compile
defineManifest(
  ['Add', 'Remove'],
  // @ts-expect-error Remove is missing
  {
    Add: { chunk: '/assets/add.js', with: [] },
  },
)

// Negative 2: duplicate tag fails to compile
defineManifest(
  // @ts-expect-error Duplicate tag in manifest: Add
  ['Add', 'Add'],
  {
    Add: { chunk: '/assets/add.js', with: [] },
  },
)
