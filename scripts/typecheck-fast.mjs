/**
 * `pnpm typecheck:fast [project...]`: a fast look at type errors with tsrs,
 * Cloudflare's experimental Rust port of the TypeScript checker. It is a look,
 * not the verdict: `tsc -b` (`pnpm typecheck`) decides, and CI runs
 * `typecheck:force`.
 *
 * With no argument it checks the projects the working tree changed; with
 * arguments, those project folders (`packages/mixins`). `--dependents` adds
 * the projects that reference them, `--since <ref>` counts what differs from
 * that ref as changed too. Each project is checked alone against its
 * references' source (the `paths` maps), so no `.tsbuild` is read or written.
 *
 * tsrs is run from a pinned version through npx, not installed: it should
 * become a devDependency at the next lockfile change, and `VERSION` then goes
 * with it. Exit status: 0 clean, 1 errors, 2 could not run.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { changedProjects, root } from './changed-projects.mjs'

const VERSION = '7.1.0-beta.tsrs3'

/**
 * Errors tsrs reports that `tsc` 7.0.2 does not, and that Microsoft's own
 * TypeScript 7.1.0-beta reports too (checked 2026-11-18): the checker changed,
 * so these are 7.1 behaviour, not a tsrs defect. They need no chasing until
 * the repository moves to 7.1.
 */
const SEVEN_ONE = [
  'packages/mixins-ui/test/comboboxOptions.test-d.ts',
  'packages/mixins-ui/test/onInput.test-d.ts',
]

/** Checks one project; its errors, and its exit status. */
export const check = project => {
  const command = `npx -y tsrs@${VERSION} -p ${project}/tsconfig.json --noEmit`
  const started = Date.now()
  const result = spawnSync(command, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 2 ** 20,
  })
  return {
    project,
    status: result.status ?? 2,
    seconds: (Date.now() - started) / 1000,
    output: `${result.stdout}${result.stderr}`.trim(),
  }
}

/** Runs every project in turn and prints each; the worst status. */
export const checkAll = projects => {
  console.log(
    `typecheck:fast: a look with tsrs ${VERSION}, not the verdict; \`tsc -b\` decides.`,
  )
  let worst = 0
  for (const project of projects) {
    if (!existsSync(join(root, project, 'tsconfig.json'))) {
      console.error(`typecheck:fast: ${project} has no tsconfig.json`)
      return 2
    }
    const { status, seconds, output } = check(project)
    const errors = output.split('\n').filter(line => line.includes(': error TS'))
    console.log(
      `${status === 0 ? 'ok  ' : 'FAIL'} ${project} (${seconds.toFixed(1)}s${status === 0 ? '' : `, ${errors.length} errors`})`,
    )
    if (status !== 0) {
      console.log(output)
      const known = SEVEN_ONE.filter(file => output.includes(file))
      if (known.length > 0) {
        console.log(
          `note: ${known.join(', ')} also fail under TypeScript 7.1 beta and not under tsc 7.0.2; ignore them here.`,
        )
      }
    }
    // tsrs exits 2 for type errors too: no error line means it did not run.
    worst = Math.max(worst, status === 0 ? 0 : errors.length > 0 ? 1 : 2)
  }
  return worst
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : undefined
  const named = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--since')
  const projects =
    named.length > 0
      ? named.map(project => project.replace(/\\/g, '/').replace(/\/$/, ''))
      : changedProjects({ since, dependents: args.includes('--dependents') }).projects
  if (projects.length === 0) {
    console.log('typecheck:fast: no changed project to check')
    process.exit(0)
  }
  process.exit(checkAll(projects))
}
