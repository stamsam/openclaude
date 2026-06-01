import { describe, expect, test } from 'bun:test'
import { rewriteOpenClaudeNeoArgv } from './openclaude-neo-args.mjs'

const base = ['node', 'openclaude-neo']

describe('openclaude-neo argv rewrite', () => {
  test('defaults to Home Dashboard', () => {
    expect(rewriteOpenClaudeNeoArgv(base)).toEqual([
      'node',
      'openclaude-neo',
      'agents',
      '--home',
    ])
  })

  test('routes free-form prompts to Home Dashboard', () => {
    expect(rewriteOpenClaudeNeoArgv([...base, 'review this diff'])).toEqual([
      'node',
      'openclaude-neo',
      'agents',
      '--home',
      'review this diff',
    ])
  })

  test('routes first-position launcher flags to Home Dashboard', () => {
    expect(rewriteOpenClaudeNeoArgv([...base, '--no-alt-screen'])).toEqual([
      'node',
      'openclaude-neo',
      'agents',
      '--home',
      '--no-alt-screen',
    ])
    expect(rewriteOpenClaudeNeoArgv([...base, '--model', 'qwen'])).toEqual([
      'node',
      'openclaude-neo',
      'agents',
      '--home',
      '--model',
      'qwen',
    ])
  })

  test('routes prompts to Home Dashboard', () => {
    expect(rewriteOpenClaudeNeoArgv([...base, 'review this repo'])).toEqual([
      'node',
      'openclaude-neo',
      'agents',
      '--home',
      'review this repo',
    ])
  })

  test('adds --home flag when agents is used explicitly', () => {
    expect(rewriteOpenClaudeNeoArgv([...base, 'agents', 'abc123'])).toEqual([
      'node',
      'openclaude-neo',
      'agents',
      '--home',
      'abc123',
    ])
  })

  test.each(['attach', 'logs', 'stop', 'respawn', 'rm', 'bg-runner'])(
    'passes through command %s',
    command => {
      expect(rewriteOpenClaudeNeoArgv([...base, command, 'abc123'])).toEqual([
        'node',
        'openclaude-neo',
        command,
        'abc123',
      ])
    },
  )

  test.each(['--version', '-v', '-V', '--help', '-h'])(
    'passes through %s',
    flag => {
      expect(rewriteOpenClaudeNeoArgv([...base, flag])).toEqual([
        'node',
        'openclaude-neo',
        flag,
      ])
    },
  )

  test('does not mutate the input argv', () => {
    const argv = [...base, '--no-alt-screen']

    rewriteOpenClaudeNeoArgv(argv)

    expect(argv).toEqual([...base, '--no-alt-screen'])
  })
})
