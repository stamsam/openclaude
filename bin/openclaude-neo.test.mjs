import { spawnSync } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

const BIN_DIR = dirname(fileURLToPath(import.meta.url))

async function runNeoArgv(args) {
  const root = await mkdtemp(join(tmpdir(), 'openclaude-neo-argv-'))
  const capturePath = join(root, 'argv.json')

  try {
    await mkdir(join(root, 'bin'), { recursive: true })
    await mkdir(join(root, 'dist'), { recursive: true })
    await copyFile(join(BIN_DIR, 'openclaude-neo'), join(root, 'bin', 'openclaude-neo'))
    await copyFile(
      join(BIN_DIR, 'openclaude-neo-args.mjs'),
      join(root, 'bin', 'openclaude-neo-args.mjs'),
    )
    await writeFile(
      join(root, 'dist', 'cli.mjs'),
      [
        "import { writeFileSync } from 'node:fs'",
        "writeFileSync(process.env.NEO_ARGV_CAPTURE, JSON.stringify(process.argv.slice(2)))",
        '',
      ].join('\n'),
    )

    const result = spawnSync(
      process.execPath,
      [join(root, 'bin', 'openclaude-neo'), ...args],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          NEO_ARGV_CAPTURE: capturePath,
        },
      },
    )

    expect(result.status, result.stderr || result.stdout).toBe(0)
    return JSON.parse(await readFile(capturePath, 'utf8'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('openclaude-neo launcher argv rewrite', () => {
  test('defaults to the Home Dashboard', async () => {
    await expect(runNeoArgv([])).resolves.toEqual(['agents', '--home'])
  })

  test('rewrites free-form prompts behind the Home Dashboard', async () => {
    await expect(runNeoArgv(['review', 'this', 'repo'])).resolves.toEqual([
      'agents',
      '--home',
      'review',
      'this',
      'repo',
    ])
  })

  test('passes through utility commands and version flags', async () => {
    await expect(runNeoArgv(['attach', 'abc123'])).resolves.toEqual([
      'attach',
      'abc123',
    ])
    await expect(runNeoArgv(['--version'])).resolves.toEqual(['--version'])
  })
})
