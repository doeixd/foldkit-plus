// @vitest-environment node
// @ts-expect-error plain JavaScript
import { programsFor } from '../programs.mjs'
import { describe, expect, test } from 'vitest'

describe('programs shared between projects', () => {
  const project = (paths: Record<string, string[]>, files: string[], strict = true) => ({
    options: { strict, pathsBasePath: '/w/p', paths },
    files,
  })
  const base = project({ 'foldkit-a': ['./a.ts'] }, ['/w/p/one.ts'])

  test('projects with the same options share one program, with their paths and files merged', () => {
    const programs = programsFor([
      base,
      project({ 'foldkit-b': ['./b.ts'] }, ['/w/p/two.ts', '/w/p/one.ts']),
    ])
    expect(programs).toHaveLength(1)
    expect(programs[0]?.files).toEqual(['/w/p/one.ts', '/w/p/two.ts'])
    expect(Object.keys(programs[0]?.options.paths ?? {})).toEqual(['foldkit-a', 'foldkit-b'])
  })

  test('a name mapped to another file stands in a program of its own', () => {
    const programs = programsFor([base, project({ 'foldkit-a': ['./other.ts'] }, ['/w/p/two.ts'])])
    expect(programs).toHaveLength(2)
  })

  test('projects compiled with different options do not share a program', () => {
    expect(programsFor([base, project({}, ['/w/p/two.ts'], false)])).toHaveLength(2)
  })
})
