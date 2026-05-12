import { describe, expect, test } from 'bun:test'

import { buildRouteCatalogModelOptions } from './routeCatalogOptions.js'

describe('buildRouteCatalogModelOptions', () => {
  test('marks the route default model as recommended without catalog metadata', () => {
    const options = buildRouteCatalogModelOptions(
      'DeepSeek',
      [
        { id: 'deepseek-chat', apiName: 'deepseek-chat', label: 'DeepSeek Chat' },
        { id: 'deepseek-v4-pro', apiName: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
      ],
      'deepseek-v4-pro',
    )

    expect(options).toEqual([
      {
        value: 'deepseek-chat',
        label: 'DeepSeek Chat',
        description: 'Provider: DeepSeek',
        descriptionForModel: 'Provider: DeepSeek (deepseek-chat)',
      },
      {
        value: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        description: 'Recommended · Provider: DeepSeek',
        descriptionForModel: 'Recommended · Provider: DeepSeek (deepseek-v4-pro)',
      },
    ])
  })

  test('marks likely multimodal local models as vision capable', () => {
    const options = buildRouteCatalogModelOptions('oMLX', [
      {
        id: 'gemma-mm',
        apiName: 'Gemma-E2B-Chimera-Multimodal-v4-MLX-4bit',
        label: 'Gemma-E2B-Chimera-Multimodal-v4-MLX-4bit',
      },
      {
        id: 'gemma-text',
        apiName: 'Gemma-E2B-Chimera v4',
        label: 'Gemma-E2B-Chimera v4',
      },
    ])

    expect(options[0]?.description).toBe('Vision · Provider: oMLX')
    expect(options[1]?.description).toBe('Provider: oMLX')
  })
})
