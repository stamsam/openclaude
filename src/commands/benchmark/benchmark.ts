import type { LocalCommandCall } from '../../types/command.js'
import {
  benchmarkMultipleModels,
  formatBenchmarkResults,
  isBenchmarkSupported,
} from '../../utils/model/benchmark.js'
import { getDefaultMainLoopModelSetting } from '../../utils/model/model.js'
import { parseModelList } from '../../utils/providerModels.js'

function getModelsToBenchmark(args: string): string[] {
  const requested = parseModelList(args)
  if (requested.length > 0) return requested

  const active =
    process.env.OPENAI_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    getDefaultMainLoopModelSetting()
  return active ? [active] : []
}

export const call: LocalCommandCall = async args => {
  if (!isBenchmarkSupported()) {
    return {
      type: 'text',
      value:
        'Benchmark not supported for this provider. Supported: OpenAI-compatible local or hosted endpoints with an active model.',
    }
  }

  const modelsToBenchmark = getModelsToBenchmark(args)
  if (modelsToBenchmark.length === 0) {
    return {
      type: 'text',
      value: 'No model selected for benchmarking.',
    }
  }

  const results = await benchmarkMultipleModels(modelsToBenchmark)
  return {
    type: 'text',
    value: formatBenchmarkResults(results),
  }
}
