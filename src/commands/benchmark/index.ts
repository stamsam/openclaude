import type { Command } from '../../commands.js'

const benchmark = {
  type: 'local',
  name: 'benchmark',
  description: 'Benchmark the active OpenAI-compatible or local model',
  argumentHint: '[model[,model...]]',
  supportsNonInteractive: true,
  load: () => import('./benchmark.js'),
} satisfies Command

export default benchmark
