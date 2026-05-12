import { mkdir, readdir, readFile, rename, stat, writeFile, appendFile } from 'fs/promises'
import { join, basename } from 'path'
import { getAPIProvider } from '../utils/model/providers.js'
import { getMainLoopModel } from '../utils/model/model.js'
import { getLearningPaths, type LearningPaths } from './paths.js'
import { redactLearningText, looksSensitive } from './redact.js'
import { learnQueueItemSchema, skillJsonSchema, type LearnQueueItem } from './schema.js'

export const MEMORY_LIMIT = 2500
export const USER_LIMIT = 1500

type CandidateInput = Omit<LearnQueueItem, 'id' | 'session_id' | 'created_at' | 'status'>

type LearnState = {
  sessions_since_run: number
  last_run_at?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]/g, '_') || 'session'
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  const raw = await readText(path)
  if (!raw.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function learningNudgeEvery(): number {
  const value = Number(process.env.OPENCLAUDE_LEARN_NUDGE_EVERY ?? 10)
  if (value === 0) return 0
  return Number.isFinite(value) && value > 0 ? value : 10
}

async function loadLearnState(paths: LearningPaths): Promise<LearnState> {
  return readJson<LearnState>(paths.stateFile, { sessions_since_run: 0 })
}

async function writeLearnState(paths: LearningPaths, state: LearnState): Promise<void> {
  await writeJson(paths.stateFile, state)
}

export function slugifyLearning(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'learned-skill'
  )
}

export async function ensureLearningStorage(paths = getLearningPaths()): Promise<void> {
  await Promise.all([
    mkdir(paths.memoryDir, { recursive: true }),
    mkdir(paths.sessionsDir, { recursive: true }),
    mkdir(paths.queueDir, { recursive: true }),
    mkdir(paths.archiveDir, { recursive: true }),
    mkdir(paths.skillsDir, { recursive: true }),
    mkdir(paths.reportsDir, { recursive: true }),
  ])
  if (!(await exists(join(paths.memoryDir, 'MEMORY.md')))) {
    await writeFile(join(paths.memoryDir, 'MEMORY.md'), '# MEMORY\n')
  }
  if (!(await exists(join(paths.memoryDir, 'USER.md')))) {
    await writeFile(join(paths.memoryDir, 'USER.md'), '# USER\n')
  }
  if (!(await exists(join(paths.memoryDir, 'openclaude-memory.sqlite')))) {
    await writeFile(join(paths.memoryDir, 'openclaude-memory.sqlite'), '')
  }
  await ensureLearningGitignore(paths)
}

async function ensureLearningGitignore(paths: LearningPaths): Promise<void> {
  const file = join(paths.home, '.gitignore')
  const block = [
    '# OpenClaude local learning data',
    'memory/',
    'learn-sessions/',
    'learn-queue/',
    'learn-reports/',
    'skills/',
    'learn-state.json',
  ].join('\n')
  const current = await readText(file)
  const marker = '# OpenClaude local learning data'
  if (current.includes(marker)) {
    const next = current
      .replace(
        /# OpenClaude local learning data(?:\n(?:memory\/|sessions\/|learn-sessions\/|learn-queue\/|learn-reports\/|skills\/|learn-state\.json))+/g,
        '',
      )
      .trimEnd()
    if (next !== current) {
      await writeFile(file, `${next ? `${next}\n\n` : ''}${block}\n`)
    }
    return
  }
  await writeFile(file, `${current.trim() ? `${current.trim()}\n\n` : ''}${block}\n`)
}

function queueItem(sessionId: string, candidate: CandidateInput): LearnQueueItem {
  return learnQueueItemSchema.parse({
    ...candidate,
    id: `${sessionId}-${candidate.candidate_type}-${Date.now().toString(36)}-${slugifyLearning(candidate.proposed_text)}`,
    session_id: sessionId,
    created_at: nowIso(),
    status: 'pending',
    proposed_text: redactLearningText(candidate.proposed_text),
    evidence_summary: redactLearningText(candidate.evidence_summary),
    sensitive: candidate.sensitive || looksSensitive(candidate.proposed_text),
  })
}

export async function addLearnCandidate(
  sessionId: string,
  candidate: CandidateInput,
  paths = getLearningPaths(),
): Promise<LearnQueueItem> {
  await ensureLearningStorage(paths)
  const file = join(paths.queueDir, `${safeSessionId(sessionId)}.json`)
  const data = await readJson<{ session_id: string; items: LearnQueueItem[] }>(file, {
    session_id: sessionId,
    items: [],
  })
  const proposedText = redactLearningText(candidate.proposed_text)
  const duplicate = data.items.find(
    item =>
      item.status === 'pending' &&
      item.candidate_type === candidate.candidate_type &&
      item.target === candidate.target &&
      item.proposed_text === proposedText,
  )
  if (duplicate) return duplicate
  const item = queueItem(sessionId, candidate)
  data.items.push(item)
  await writeJson(file, data)
  return item
}

export async function loadPendingLearnItems(paths = getLearningPaths()): Promise<LearnQueueItem[]> {
  const entries = await readdir(paths.queueDir, { withFileTypes: true }).catch(() => [])
  const items: LearnQueueItem[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const data = await readJson<{ items?: unknown[] }>(join(paths.queueDir, entry.name), {})
    for (const raw of data.items ?? []) {
      const parsed = learnQueueItemSchema.safeParse(raw)
      if (parsed.success && parsed.data.status === 'pending') items.push(parsed.data)
    }
  }
  return items
}

function compact(text: string, limit: number): string {
  const safe = redactLearningText(text).trim()
  if (safe.length <= limit) return safe
  return `${safe.slice(0, Math.max(0, limit - 14)).trimEnd()}\n[truncated]`
}

function normalizeMemoryLine(line: string): string {
  return line.trim().replace(/^-\s+/, '')
}

async function appendMemoryFacts(items: LearnQueueItem[], paths: LearningPaths): Promise<boolean> {
  const file = join(paths.memoryDir, 'MEMORY.md')
  const existing = (await readText(file))
    .split('\n')
    .map(normalizeMemoryLine)
    .filter(line => line && line !== '# MEMORY')
  const additions = items
    .filter(item => item.candidate_type === 'memory' && !item.sensitive)
    .map(item => normalizeMemoryLine(item.proposed_text))
  const unique = [...new Set([...existing, ...additions])]
  const next = compact(['# MEMORY', ...unique.map(line => `- ${line}`)].join('\n'), MEMORY_LIMIT)
  await writeFile(file, `${next}\n`)
  return additions.length > 0
}

async function maybeAppendUserFacts(items: LearnQueueItem[], paths: LearningPaths): Promise<boolean> {
  if (process.env.OPENCLAUDE_ALLOW_USER_MEMORY !== '1') return false
  const safe = items.filter(item => item.candidate_type === 'user_memory' && !item.sensitive)
  if (!safe.length) return false
  const file = join(paths.memoryDir, 'USER.md')
  const existing = (await readText(file))
    .split('\n')
    .map(normalizeMemoryLine)
    .filter(line => line && line !== '# USER')
  const unique = [...new Set([...existing, ...safe.map(item => item.proposed_text)])]
  const next = compact(['# USER', ...unique.map(line => `- ${line}`)].join('\n'), USER_LIMIT)
  await writeFile(file, `${next}\n`)
  return true
}

async function writeSkillDraft(item: LearnQueueItem, paths: LearningPaths): Promise<string | null> {
  if (item.candidate_type !== 'skill' || item.sensitive || item.confidence !== 'high') return null
  const slug = slugifyLearning(item.proposed_text)
  const dir = join(paths.skillsDir, slug)
  if (await exists(dir)) {
    const patchFile = join(dir, `proposed_patch-${nowIso().slice(0, 10)}.md`)
    await writeFile(patchFile, `# Proposed patch\n\n${item.proposed_text}\n\nEvidence:\n${item.evidence_summary}\n`)
    return patchFile
  }
  await mkdir(join(dir, 'examples'), { recursive: true })
  const meta = skillJsonSchema.parse({
    name: item.proposed_text.replace(/^Reusable workflow:\s*/i, '').replace(/\.$/, ''),
    slug,
    description: item.proposed_text,
    created_at: nowIso(),
    updated_at: nowIso(),
    source: 'learn',
    confidence: item.confidence,
    usage_count: item.repeat_count ?? 1,
    last_used_at: nowIso(),
    pinned: false,
    status: 'active',
  })
  await writeJson(join(dir, 'skill.json'), meta)
  await writeFile(
    join(dir, 'SKILL.md'),
    `# ${meta.name}\n\n## When to use\n${item.proposed_text}\n\n## Workflow\n- Re-run the commands and checks that produced the evidence.\n\n## Gotchas\n- Do not treat this as a transcript dump.\n\n## Verification\n- Confirm the same workflow still succeeds.\n\n## Evidence\n${item.evidence_summary}\n`,
  )
  await writeFile(join(dir, 'examples', 'README.md'), `# Examples\n\n${item.evidence_summary}\n`)
  return dir
}

async function archiveQueues(items: LearnQueueItem[], paths: LearningPaths): Promise<string | null> {
  if (!items.length) return null
  const archiveFile = join(paths.archiveDir, `processed-items-${Date.now().toString(36)}.json`)
  await writeJson(archiveFile, { archived_at: nowIso(), items })
  for (const sessionId of [...new Set(items.map(item => item.session_id))]) {
    await writeJson(join(paths.queueDir, `${sessionId}.json`), { session_id: sessionId, items: [] })
  }
  return archiveFile
}

function candidateLabel(item: LearnQueueItem, index: number): string {
  const type = item.candidate_type === 'skill' ? 'skill candidate' : item.candidate_type === 'cleanup' ? 'cleanup' : 'memory candidate'
  return `[${index}] ${type}\nTarget: ${item.target}\nConfidence: ${item.confidence}\nProposed:\n${item.proposed_text}\n\nEvidence:\n${item.evidence_summary}`
}

export async function reviewLearning(paths = getLearningPaths()): Promise<string> {
  const items = await loadPendingLearnItems(paths)
  const lines = ['Learning review:', '']
  let index = 1
  for (const item of items) lines.push(candidateLabel(item, index++), '')
  if (!items.length) lines.push('No pending learning candidates found.', '')
  const state = await loadLearnState(paths)
  const nudgeEvery = learningNudgeEvery()
  if (nudgeEvery > 0 && state.sessions_since_run >= nudgeEvery) {
    lines.push(
      `Nudge: ${state.sessions_since_run} sessions have completed since the last /learn run.`,
      '',
    )
  }
  lines.push(`Would archive ${items.length} pending queue item${items.length === 1 ? '' : 's'}.`)
  lines.push('Run /learn run to apply.')
  return `${lines.join('\n').trim()}\n`
}

export async function runLearning(paths = getLearningPaths()): Promise<string> {
  await ensureLearningStorage(paths)
  const items = await loadPendingLearnItems(paths)
  const applied: string[] = []
  if (await appendMemoryFacts(items, paths)) applied.push('updated MEMORY.md')
  if (await maybeAppendUserFacts(items, paths)) applied.push('updated USER.md')
  for (const item of items) {
    const skillPath = await writeSkillDraft(item, paths)
    if (skillPath) applied.push(`wrote ${basename(skillPath)}`)
  }
  const archiveFile = await archiveQueues(items, paths)
  if (archiveFile) applied.push(`archived ${items.length} queue item${items.length === 1 ? '' : 's'}`)
  const report = [
    '# Learning report',
    `- created_at: ${nowIso()}`,
    `- active_provider: ${getAPIProvider()}`,
    `- active_model: ${getMainLoopModel()}`,
    `- processed_items: ${items.length}`,
    '',
    ...(applied.length ? ['Applied:', ...applied.map(line => `- ${line}`)] : ['No pending learning candidates found.']),
  ].join('\n')
  const reportFile = join(paths.reportsDir, `${nowIso().replace(/[:.]/g, '-')}.md`)
  await writeFile(reportFile, `${report}\n`)
  await writeLearnState(paths, { sessions_since_run: 0, last_run_at: nowIso() })
  return `${report}\n`
}

export async function recordLearningSessionEvent(
  sessionId: string,
  event: Record<string, unknown>,
  paths = getLearningPaths(),
): Promise<void> {
  await ensureLearningStorage(paths)
  const payload = JSON.stringify(
    { at: nowIso(), ...event },
    (_key, value) => (typeof value === 'string' ? redactLearningText(value) : value),
  )
  await appendFile(join(paths.sessionsDir, `${safeSessionId(sessionId)}.jsonl`), `${payload}\n`)
  if (event.type === 'session.end') {
    const state = await loadLearnState(paths)
    await writeLearnState(paths, {
      ...state,
      sessions_since_run: (state.sessions_since_run ?? 0) + 1,
    })
  }
}

export async function recordPassiveLearningCandidate(
  sessionId: string,
  text: string,
  evidence: string,
  paths = getLearningPaths(),
): Promise<void> {
  const safeText = redactLearningText(text)
  if (/\bbun(?:\.lock|\s+test|\s+run)?\b/i.test(safeText)) {
    await addLearnCandidate(sessionId, {
      candidate_type: 'memory',
      confidence: 'high',
      proposed_text: 'Project uses Bun.',
      evidence_summary: evidence,
      target: 'MEMORY.md',
      sensitive: false,
    })
  }
  if (/\btypescript\b|tsconfig\.json|\.(ts|tsx)\b/i.test(safeText)) {
    await addLearnCandidate(sessionId, {
      candidate_type: 'memory',
      confidence: 'high',
      proposed_text: 'Project uses TypeScript.',
      evidence_summary: evidence,
      target: 'MEMORY.md',
      sensitive: false,
    })
  }
  if (/\b(git status|git diff|bun test|npm test|pnpm test)\b/i.test(safeText)) {
    await addLearnCandidate(sessionId, {
      candidate_type: 'skill',
      confidence: 'high',
      proposed_text: 'Reusable verification workflow for local project checks.',
      evidence_summary: evidence,
      target: 'skills/draft',
      sensitive: false,
      repeat_count: 2,
    })
  }
}

export async function loadLearningPromptSnapshot(paths = getLearningPaths()): Promise<string[]> {
  await ensureLearningStorage(paths)
  const memory = compact(await readText(join(paths.memoryDir, 'MEMORY.md')), MEMORY_LIMIT)
  const user = compact(await readText(join(paths.memoryDir, 'USER.md')), USER_LIMIT)
  const skills: string[] = []
  const entries = await readdir(paths.skillsDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.archive') continue
    const meta = skillJsonSchema.safeParse(await readJson(join(paths.skillsDir, entry.name, 'skill.json'), null))
    if (meta.success && (meta.data.status === 'active' || meta.data.pinned)) {
      skills.push(`- ${meta.data.name}`)
    }
  }
  return [memory, user, skills.length ? `Active learned skills:\n${skills.slice(0, 3).join('\n')}` : ''].filter(Boolean)
}
