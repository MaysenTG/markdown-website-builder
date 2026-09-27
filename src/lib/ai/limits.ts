/** Keep in sync with worker/src/limits.ts */
export const LIMITS = {
  maxDocumentChars: 48_000,
  /**
   * User instructions in the AI chat, measured as JavaScript string length.
   * Assistant replies in the transcript use maxResponseMessageChars instead.
   */
  maxUserMessageChars: 100,
  /** Safety cap for transcript lines that are not the user instruction. */
  maxMessageChars: 4_000,
  maxMessages: 16,
  maxExcerptChars: 500,
  maxHintChars: 500,
  maxLabelChars: 80,
  maxTagChars: 32,
  maxHeadingPath: 12,
  maxHeadingChars: 200,
  maxResponseMessageChars: 2_000,
  maxBodyBytes: 150_000,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 20,
} as const
