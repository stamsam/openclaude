import assert from 'node:assert/strict'
import test from 'node:test'

import { extractGitHubRepoSlug } from './repoSlug.ts'

test('keeps owner/repo input as-is', () => {
  assert.equal(extractGitHubRepoSlug('stamsam/openclaude-private'), 'stamsam/openclaude-private')
})

test('extracts slug from https GitHub URLs', () => {
  assert.equal(
    extractGitHubRepoSlug('https://github.com/stamsam/openclaude-private'),
    'stamsam/openclaude-private',
  )
  assert.equal(
    extractGitHubRepoSlug('https://www.github.com/stamsam/openclaude-private.git'),
    'stamsam/openclaude-private',
  )
})

test('extracts slug from ssh GitHub URLs', () => {
  assert.equal(
    extractGitHubRepoSlug('git@github.com:stamsam/openclaude-private.git'),
    'stamsam/openclaude-private',
  )
  assert.equal(
    extractGitHubRepoSlug('ssh://git@github.com/stamsam/openclaude-private'),
    'stamsam/openclaude-private',
  )
})

test('rejects malformed or non-GitHub URLs', () => {
  assert.equal(extractGitHubRepoSlug('https://gitlab.com/stamsam/openclaude-private'), null)
  assert.equal(extractGitHubRepoSlug('https://github.com/stamsam'), null)
  assert.equal(extractGitHubRepoSlug('not actually github.com/stamsam/openclaude-private'), null)
  assert.equal(
    extractGitHubRepoSlug('https://evil.example/?next=github.com/stamsam/openclaude-private'),
    null,
  )
  assert.equal(
    extractGitHubRepoSlug('https://github.com.evil.example/stamsam/openclaude-private'),
    null,
  )
  assert.equal(
    extractGitHubRepoSlug('https://example.com/github.com/stamsam/openclaude-private'),
    null,
  )
})
