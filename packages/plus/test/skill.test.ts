// @vitest-environment node
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { compareVersions, mismatchNote, nameOf, planInstall, versionOf } from '../src/skill.js'

describe('front matter', () => {
  const text = "---\nname: foldkit-plus\nmetadata:\n  version: '0.40.0'\n  repository: x\n---\n"
  it('reads the name and the metadata version', () => {
    expect(nameOf(text)).toEqual(Option.some('foldkit-plus'))
    expect(versionOf(text)).toEqual(Option.some('0.40.0'))
    expect(versionOf('# no front matter')).toEqual(Option.none())
  })
})

it.each([
  ['0.9.0', '0.40.0', -1],
  ['0.40.0', '0.9.0', 1],
  ['1.0.0', '1.0.0', 0],
  ['1.0', '1.0.0', 0],
  ['0.40.1', '0.40.0', 1],
])('compares %s with %s numerically, not as text', (a, b, sign) => {
  expect(Math.sign(compareVersions(a, b))).toBe(sign)
})

describe('planInstall', () => {
  const ours = (version: string) => Option.some({ ours: true, version: Option.some(version) })
  it.each([
    ['nothing there', Option.none(), false, 'write'],
    ['the same version', ours('1.0.0'), false, 'current'],
    ['the same version, forced', ours('1.0.0'), true, 'current'],
    ['another version', ours('0.9.0'), false, 'refuse'],
    ['another version, forced', ours('0.9.0'), true, 'replace'],
    ['no version', Option.some({ ours: true, version: Option.none() }), false, 'refuse'],
    [
      'another skill of the same version',
      Option.some({ ours: false, version: Option.some('1.0.0') }),
      false,
      'refuse',
    ],
    [
      'another skill, forced',
      Option.some({ ours: false, version: Option.none() }),
      true,
      'replace',
    ],
  ] as const)('%s', (_, existing, force, plan) => {
    expect(planInstall(existing, '1.0.0', force)).toBe(plan)
  })
})

describe('mismatchNote', () => {
  it.each([
    ['0.9.0', 'older than the 0.40.0'],
    ['1.0.0', 'newer than the 0.40.0'],
  ])('says %s is %s', (found, words) => {
    const note = Option.getOrThrow(
      mismatchNote('.claude/skills/foldkit-plus', found, '0.40.0', 'foldkit-plus@0.22.0'),
    )
    expect(note).toContain(`is ${found}, ${words} that ships with foldkit-plus@0.22.0`)
  })
  it('is silent for the same version', () => {
    expect(mismatchNote('x', '0.40.0', '0.40.0', 'p')).toEqual(Option.none())
  })
})
