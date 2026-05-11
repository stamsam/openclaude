import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, test } from 'bun:test'
import {
  addLearnCandidate,
  ensureLearningStorage,
  loadLearningPromptSnapshot,
  loadPendingLearnItems,
  recordLearningSessionEvent,
  reviewLearning,
  runLearning,
} from './core.js'
import { getLearningPaths } from './paths.js'

async function tempPaths() {
  const home = await mkdtemp(join(tmpdir(), 'openclaude-learn-'))
  const paths = getLearningPaths({ OPENCLAUDE_HOME: home } as NodeJS.ProcessEnv)
  await ensureLearningStorage(paths)
  return paths
}

describe('learning', () => {
  test('/learn preview mutates nothing', async () => {
    const paths = await tempPaths()
    await addLearnCandidate(
      's1',
      {
        candidate_type: 'memory',
        confidence: 'high',
        proposed_text: 'Project uses Bun.',
        evidence_summary: 'bun test succeeded',
        target: 'MEMORY.md',
        sensitive: false,
      },
      paths,
    )
    const before = await readFile(join(paths.memoryDir, 'MEMORY.md'), 'utf8')
    const report = await reviewLearning(paths)
    const after = await readFile(join(paths.memoryDir, 'MEMORY.md'), 'utf8')
    expect(report).toContain('Learning review:')
    expect(after).toBe(before)
  })

  test('duplicates are suppressed within a session queue', async () => {
    const paths = await tempPaths()
    const candidate = {
      candidate_type: 'memory' as const,
      confidence: 'high' as const,
      proposed_text: 'Project uses Bun.',
      evidence_summary: 'bun test succeeded',
      target: 'MEMORY.md',
      sensitive: false,
    }
    const first = await addLearnCandidate('s1', candidate, paths)
    const second = await addLearnCandidate('s1', candidate, paths)
    expect(second.id).toBe(first.id)
    expect(await loadPendingLearnItems(paths)).toHaveLength(1)
  })

  test('session nudge appears after configured interval and resets on run', async () => {
    const paths = await tempPaths()
    const previous = process.env.OPENCLAUDE_LEARN_NUDGE_EVERY
    process.env.OPENCLAUDE_LEARN_NUDGE_EVERY = '2'
    try {
      await recordLearningSessionEvent('s1', { type: 'session.end' }, paths)
      expect(await reviewLearning(paths)).not.toContain('Nudge:')
      await recordLearningSessionEvent('s2', { type: 'session.end' }, paths)
      expect(await reviewLearning(paths)).toContain('Nudge: 2 sessions')
      await runLearning(paths)
      expect(await reviewLearning(paths)).not.toContain('Nudge:')
    } finally {
      if (previous === undefined) delete process.env.OPENCLAUDE_LEARN_NUDGE_EVERY
      else process.env.OPENCLAUDE_LEARN_NUDGE_EVERY = previous
    }
  })

  test('/learn run applies and archives queue', async () => {
    const paths = await tempPaths()
    await addLearnCandidate(
      's1',
      {
        candidate_type: 'memory',
        confidence: 'high',
        proposed_text: 'Project uses TypeScript.',
        evidence_summary: 'tsconfig.json detected',
        target: 'MEMORY.md',
        sensitive: false,
      },
      paths,
    )
    const report = await runLearning(paths)
    expect(report).toContain('active_model')
    expect(await readFile(join(paths.memoryDir, 'MEMORY.md'), 'utf8')).toContain('Project uses TypeScript')
    expect(await loadPendingLearnItems(paths)).toHaveLength(0)
    expect(await readdir(paths.archiveDir)).toHaveLength(1)
  })

  test('sensitive USER.md protection', async () => {
    const paths = await tempPaths()
    await addLearnCandidate(
      's1',
      {
        candidate_type: 'user_memory',
        confidence: 'high',
        proposed_text: 'User token is sk-1234567890abcdef',
        evidence_summary: 'secret-like text',
        target: 'USER.md',
        sensitive: true,
      },
      paths,
    )
    await runLearning(paths)
    expect(await readFile(join(paths.memoryDir, 'USER.md'), 'utf8')).not.toContain('sk-1234567890abcdef')
  })

  test('skill draft creation and duplicate preservation', async () => {
    const paths = await tempPaths()
    const candidate = {
      candidate_type: 'skill' as const,
      confidence: 'high' as const,
      proposed_text: 'Reusable workflow: git status > bun test.',
      evidence_summary: 'seen twice',
      target: 'skills/draft',
      sensitive: false,
      repeat_count: 2,
    }
    await addLearnCandidate('s1', candidate, paths)
    await runLearning(paths)
    await addLearnCandidate('s2', candidate, paths)
    await runLearning(paths)
    const skillDir = join(paths.skillsDir, 'reusable-workflow-git-status-bun-test')
    expect(await readdir(skillDir)).toContain('SKILL.md')
    expect((await readdir(skillDir)).some(name => name.startsWith('proposed_patch-'))).toBe(true)
  })

  test('prompt snapshot excludes archived skills', async () => {
    const paths = await tempPaths()
    const active = join(paths.skillsDir, 'active-skill')
    const archived = join(paths.skillsDir, '.archive', 'archived-skill')
    await mkdir(active, { recursive: true })
    await mkdir(archived, { recursive: true })
    await writeFile(join(active, 'skill.json'), JSON.stringify({ name: 'Active Skill', slug: 'active-skill', description: 'x', created_at: 'x', updated_at: 'x', source: 'learn', confidence: 'high', usage_count: 1, last_used_at: 'x', pinned: false, status: 'active' }))
    await writeFile(join(archived, 'skill.json'), JSON.stringify({ name: 'Archived Skill', slug: 'archived-skill', description: 'x', created_at: 'x', updated_at: 'x', source: 'learn', confidence: 'high', usage_count: 1, last_used_at: 'x', pinned: false, status: 'archived' }))
    const snapshot = await loadLearningPromptSnapshot(paths)
    expect(snapshot.join('\n')).toContain('Active Skill')
    expect(snapshot.join('\n')).not.toContain('Archived Skill')
  })
})
