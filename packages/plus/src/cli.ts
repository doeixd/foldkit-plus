#!/usr/bin/env node
/**
 * `npx foldkit-plus setup`: reads the project in the current folder and this
 * package's own manifest, and prints `setup.ts`'s instructions for it.
 */
import { fileURLToPath } from 'node:url'

import { managerIn, projectIn, readManifest } from './project.js'
import { setupGuide } from './setup.js'

const usage = `Usage: npx foldkit-plus setup

Prints, for the project in this folder, how to install Effect, Foldkit and
Foldkit Plus, how to add the agent skill, and which package does which job:
instructions written for a coding agent to follow.`

/** The versions this release installs, from its own manifest, beside `dist` and `src` alike. */
const ownVersions = () => {
  const own = readManifest(fileURLToPath(new URL('../package.json', import.meta.url)))
  if (own.version === undefined) throw new Error("foldkit-plus's manifest has no version")
  if (own.setup === undefined) throw new Error("foldkit-plus's manifest names no setup versions")
  return { plus: own.version, ...own.setup }
}

const [command = 'setup'] = process.argv.slice(2)
if (command === 'setup') {
  const folder = process.cwd()
  process.stdout.write(
    setupGuide({ project: projectIn(folder), manager: managerIn(folder), versions: ownVersions() }),
  )
} else {
  process.stdout.write(`${usage}\n`)
  process.exitCode = command === '--help' || command === '-h' || command === 'help' ? 0 : 1
}
