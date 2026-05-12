const VISION_MODEL_NAME_PATTERNS = [
  /\bvl\b/i,
  /\bvlm\b/i,
  /\bvision\b/i,
  /\bvisual\b/i,
  /\bmultimodal\b/i,
  /\bimage\b/i,
  /\bllava\b/i,
  /\bmoondream\b/i,
  /\bpixtral\b/i,
  /\binternvl\b/i,
  /\bminicpm[-_]?v\b/i,
  /\bqwen(?:\d+(?:\.\d+)?)?[-_ ]?vl\b/i,
]

export function isLikelyVisionModelName(model: string | null | undefined): boolean {
  if (!model) {
    return false
  }

  return VISION_MODEL_NAME_PATTERNS.some(pattern => pattern.test(model))
}

export function shouldWarnAboutImageModelSupport(options: {
  hasImages: boolean
  model: string | null | undefined
  isLocalRuntime?: boolean
}): boolean {
  if (!options.hasImages || !options.isLocalRuntime) {
    return false
  }

  return !isLikelyVisionModelName(options.model)
}
