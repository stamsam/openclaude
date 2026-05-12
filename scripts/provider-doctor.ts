// @ts-nocheck
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  defaultLocalDiagnosticProvider,
  runLocalModelDiagnostics,
} from '../src/utils/localModelDiagnostics.ts'

function readArg(name: string): string | null {
  const args = process.argv.slice(2)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] ?? null : null
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name)
}

function parseProvider(value: string | null) {
  if (
    value === 'ollama' ||
    value === 'omlx' ||
    value === 'omlx-anthropic' ||
    value === 'openai-compatible'
  ) {
    return value
  }
  return defaultLocalDiagnosticProvider()
}

function printHuman(report) {
  console.log(`Provider: ${report.provider}`)
  console.log(`Base URL: ${report.baseUrl}`)
  console.log(`Reachable: ${report.reachable ? 'yes' : 'no'}`)
  console.log(`Models: ${report.models.length}`)
  if (report.selectedModel) {
    console.log(`Selected model: ${report.selectedModel}`)
  }
  if (report.generation) {
    const status = report.generation.ok ? 'PASS' : 'FAIL'
    const latency = report.generation.latencyMs
      ? `${Math.round(report.generation.latencyMs)}ms`
      : 'n/a'
    const tps = report.generation.tokensPerSecond
      ? `${report.generation.tokensPerSecond.toFixed(2)} tok/s`
      : 'n/a'
    console.log(`Generation: ${status} (${latency}, ${tps})`)
    if (report.generation.detail) {
      console.log(`Detail: ${report.generation.detail}`)
    }
  }
}

const report = await runLocalModelDiagnostics({
  provider: parseProvider(readArg('--provider')),
  baseUrl: readArg('--base-url') ?? undefined,
  model: readArg('--model') ?? undefined,
  apiKey: readArg('--api-key') ?? undefined,
  timeoutMs: Number(readArg('--timeout-ms') ?? 8000),
  benchmark: hasFlag('--benchmark'),
  prewarm: hasFlag('--prewarm'),
})

const outFile = readArg('--out')
if (outFile) {
  const filePath = resolve(process.cwd(), outFile)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(report, null, 2))
}

if (hasFlag('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printHuman(report)
}

if (report.generation && !report.generation.ok) {
  process.exit(1)
}
