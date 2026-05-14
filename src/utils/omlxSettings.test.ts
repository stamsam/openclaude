import { mkdtemp, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, expect, test } from 'bun:test'

import { readOmlxContextWindow } from './omlxSettings.js'

const originalEnv = {
  OMLX_CONTEXT_WINDOW: process.env.OMLX_CONTEXT_WINDOW,
}

afterEach(() => {
  if (originalEnv.OMLX_CONTEXT_WINDOW === undefined) {
    delete process.env.OMLX_CONTEXT_WINDOW
  } else {
    process.env.OMLX_CONTEXT_WINDOW = originalEnv.OMLX_CONTEXT_WINDOW
  }
})

test('readOmlxContextWindow honors explicit oMLX env overrides', () => {
  process.env.OMLX_CONTEXT_WINDOW = '131_072'

  expect(readOmlxContextWindow({ processEnv: process.env })).toBe(131_072)
})

test('readOmlxContextWindow reads matching local model config files', async () => {
  delete process.env.OMLX_CONTEXT_WINDOW
  const homeDir = await mkdtemp(join(tmpdir(), 'openclaude-omlx-'))
  const modelDir = join(homeDir, '.omlx', 'models', 'org__local-model')
  await mkdir(modelDir, { recursive: true })
  await writeFile(
    join(modelDir, 'config.json'),
    JSON.stringify({ max_position_embeddings: 98_304 }),
  )

  expect(
    readOmlxContextWindow({
      homeDir,
      model: 'org/local-model',
      processEnv: {},
    }),
  ).toBe(98_304)
})
