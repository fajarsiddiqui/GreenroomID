import { track } from '@vercel/analytics'

const ALLOWED_PROMPT_TOOL_EVENTS = new Set([
  'tool_view',
  'tool_started',
  'tool_generated',
  'tool_copied',
  'tool_survey_clicked',
])

const toSafeString = (value, fallback = '') => {
  const normalizedValue = String(value ?? fallback).trim()

  return normalizedValue.slice(0, 255)
}

const toSafeCount = (value) => {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return 0
  }

  return Math.max(0, Math.round(numericValue))
}

export const trackPromptToolEvent = (
  eventName,
  metadata = {},
) => {
  if (!ALLOWED_PROMPT_TOOL_EVENTS.has(eventName)) {
    return
  }

  const safeMetadata = {
    tool_id: toSafeString(metadata.tool_id),
    tool_slug: toSafeString(metadata.tool_slug),
    tool_category: toSafeString(
      metadata.tool_category,
      'umum',
    ),
    question_count: toSafeCount(metadata.question_count),
    visible_question_count: toSafeCount(
      metadata.visible_question_count,
    ),
  }

  try {
    const result = track(eventName, safeMetadata)

    if (
      result
      && typeof result.catch === 'function'
    ) {
      result.catch(() => {})
    }
  } catch {
    // Analytics tidak boleh mengganggu fungsi utama tool.
  }
}