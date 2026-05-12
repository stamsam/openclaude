import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, test } from 'bun:test'
import {
  addLearnCandidate,
  ensureLearningStorage,
  loadLearningPromptSnapshot,
  loadPendingLearnItems,
  recordPassiveLearningCandidate,
  recordLearningSessionEvent,
  reviewLearning,
  runLearning,
} from './core.js'
import { getLearningPaths } from './paths.js'
import { clearSkillCaches, getSkillDirCommands } from '../skills/loadSkillsDir.js'

async function tempPaths() {
  const home = await mkdtemp(join(tmpdir(), 'openclaude-learn-'))
  const paths = getLearningPaths({ OPENCLAUDE_HOME: home } as NodeJS.ProcessEnv)
  await ensureLearningStorage(paths)
  return paths
}

describe('learning', () => {
  test('/learn preview mutates nothing', async () => {
    const home = await mkdtemp(join(tmpdir(), 'openclaude-learn-'))
    const paths = getLearningPaths({ OPENCLAUDE_HOME: home } as NodeJS.ProcessEnv)
    const report = await reviewLearning(paths)
    expect(report).toContain('Learning review:')
    expect(report).toContain('Learning scopes:')
    expect(report).toContain('learned_skills_loader_visibility')
    expect(await readdir(home)).toHaveLength(0)
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

  test('duplicates merge across sessions and increase repeat count', async () => {
    const paths = await tempPaths()
    const candidate = {
      candidate_type: 'memory' as const,
      confidence: 'high' as const,
      proposed_text: 'Project uses Bun.',
      evidence_summary: 'bun.lock detected',
      target: 'MEMORY.md',
      sensitive: false,
      repeat_count: 1,
    }
    const first = await addLearnCandidate('s1', candidate, paths)
    const second = await addLearnCandidate('s2', candidate, paths)
    expect(second.id).toBe(first.id)
    expect(second.repeat_count).toBe(2)
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

  test('session nudge can be disabled with zero', async () => {
    const paths = await tempPaths()
    const previous = process.env.OPENCLAUDE_LEARN_NUDGE_EVERY
    process.env.OPENCLAUDE_LEARN_NUDGE_EVERY = '0'
    try {
      await recordLearningSessionEvent('s1', { type: 'session.end' }, paths)
      await recordLearningSessionEvent('s2', { type: 'session.end' }, paths)
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
        repeat_count: 2,
      },
      paths,
    )
    const report = await runLearning(paths)
    expect(report).toContain('active_model')
    expect(report).toContain('Learning scopes:')
    expect(await readFile(join(paths.memoryDir, 'MEMORY.md'), 'utf8')).toContain('Project uses TypeScript')
    expect(await loadPendingLearnItems(paths)).toHaveLength(0)
    expect(await readdir(paths.archiveDir)).toHaveLength(1)
  })

  test('review holds back low-signal candidates until repeated enough', async () => {
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
        repeat_count: 1,
      },
      paths,
    )
    const report = await reviewLearning(paths)
    expect(report).toContain('No promotable learning candidates found.')
    expect(report).toContain('held until repeated enough to promote')
  })

  test('/learn run ignores held-back low-signal candidates', async () => {
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
        repeat_count: 1,
      },
      paths,
    )
    const report = await runLearning(paths)
    expect(report).toContain('processed_items: 0')
    expect(await loadPendingLearnItems(paths)).toHaveLength(1)
    expect(await readFile(join(paths.memoryDir, 'MEMORY.md'), 'utf8')).not.toContain('Project uses TypeScript.')
  })

  test('/learn run preserves held-back candidates when archiving promotable siblings', async () => {
    const paths = await tempPaths()
    await addLearnCandidate(
      's1',
      {
        candidate_type: 'memory',
        confidence: 'high',
        proposed_text: 'Project uses TypeScript.',
        evidence_summary: 'tsconfig.json detected twice',
        target: 'MEMORY.md',
        sensitive: false,
        repeat_count: 2,
      },
      paths,
    )
    await addLearnCandidate(
      's1',
      {
        candidate_type: 'memory',
        confidence: 'high',
        proposed_text: 'Project uses Vitest.',
        evidence_summary: 'single package.json observation',
        target: 'MEMORY.md',
        sensitive: false,
        repeat_count: 1,
      },
      paths,
    )

    const report = await runLearning(paths)
    const pending = await loadPendingLearnItems(paths)
    const memory = await readFile(join(paths.memoryDir, 'MEMORY.md'), 'utf8')

    expect(report).toContain('processed_items: 1')
    expect(memory).toContain('Project uses TypeScript.')
    expect(memory).not.toContain('Project uses Vitest.')
    expect(pending).toHaveLength(1)
    expect(pending[0].proposed_text).toBe('Project uses Vitest.')
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
      repeat_count: 3,
    }
    await addLearnCandidate('s1', candidate, paths)
    await runLearning(paths)
    await addLearnCandidate('s2', candidate, paths)
    await runLearning(paths)
    const skillDir = join(paths.skillsDir, 'reusable-workflow-git-status-bun-test')
    expect(await readdir(skillDir)).toContain('SKILL.md')
    expect((await readdir(skillDir)).some(name => name.startsWith('proposed_patch-'))).toBe(true)
  })

  test('learned skill drafts are visible to the existing user skill loader', async () => {
    const home = await mkdtemp(join(tmpdir(), 'openclaude-learn-skills-'))
    const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
    try {
      process.env.CLAUDE_CONFIG_DIR = home
      clearSkillCaches()
      const paths = getLearningPaths()
      await ensureLearningStorage(paths)
      await mkdir(join(home, 'workspace'), { recursive: true })
      await addLearnCandidate(
        's1',
        {
          candidate_type: 'skill',
          confidence: 'high',
          proposed_text: 'Reusable workflow: git status > bun test.',
          evidence_summary: 'seen three times',
          target: 'skills/draft',
          sensitive: false,
          repeat_count: 3,
        },
        paths,
      )
      await runLearning(paths)

      const rawSkill = await readFile(
        join(paths.skillsDir, 'reusable-workflow-git-status-bun-test', 'SKILL.md'),
        'utf8',
      )
      expect(rawSkill).toContain('---')
      expect(rawSkill).toContain('description:')
      expect(rawSkill).toContain('when_to_use:')

      clearSkillCaches()
      const commands = await getSkillDirCommands(join(home, 'workspace'))
      const learnedSkill = commands.find(command => command.name === 'reusable-workflow-git-status-bun-test')
      expect(learnedSkill?.type).toBe('prompt')
      if (learnedSkill?.type === 'prompt') {
        expect(learnedSkill.description).toContain('Reusable workflow')
        expect(learnedSkill.whenToUse).toContain('Reusable workflow')
      }
    } finally {
      if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
      else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
      clearSkillCaches()
    }
  })

  test('session event payloads are redacted', async () => {
    const paths = await tempPaths()
    await recordLearningSessionEvent(
      's1',
      {
        type: 'session.end',
        result: 'Bearer secret-token-12345 and sk-1234567890abcdef',
      },
      paths,
    )
    const log = await readFile(join(paths.sessionsDir, 's1.jsonl'), 'utf8')
    expect(log).not.toContain('secret-token-12345')
    expect(log).not.toContain('sk-1234567890abcdef')
    expect(log).toContain('[REDACTED]')
  })

  test('learning uses dedicated learn-sessions storage', async () => {
    const paths = await tempPaths()
    expect(paths.sessionsDir.endsWith('learn-sessions')).toBe(true)
    expect(paths.legacySessionsDir.endsWith('sessions')).toBe(true)
    await recordLearningSessionEvent('s1', { type: 'session.start' }, paths)
    const log = await readFile(join(paths.sessionsDir, 's1.jsonl'), 'utf8')
    expect(log).toContain('session.start')
  })

  test('passive skill learning requires repeated multi-step verification evidence', async () => {
    const paths = await tempPaths()
    await recordPassiveLearningCandidate(
      's1',
      'git status',
      'single verification command',
      paths,
    )
    expect(await loadPendingLearnItems(paths)).toHaveLength(0)

    await recordPassiveLearningCandidate(
      's1',
      'git status && bun test',
      'multi-step verification workflow',
      paths,
    )
    const items = await loadPendingLearnItems(paths)
    const skill = items.find(item => item.candidate_type === 'skill')
    expect(skill).toBeTruthy()
    expect(skill?.repeat_count).toBe(1)
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
