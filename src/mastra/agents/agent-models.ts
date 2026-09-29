/**
 * Model resolution and configuration helper for Mastra agents.
 * Maps environment variables and selects appropriate model identifier.
 */

export function configureProviderEnvironment(): void {
  if (typeof process === 'undefined') return;

  // Map GEMINI_API_KEY to GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY if not already set
  if (process.env.GEMINI_API_KEY) {
    if (!process.env.GOOGLE_API_KEY) {
      process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
    }
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
    }
  }
}

export function getDefaultModel(): string {
  configureProviderEnvironment();

  if (process.env.OPENAI_API_KEY) {
    return 'openai/gpt-4o';
  }

  if (process.env.GEMINI_MODEL) {
    const model = process.env.GEMINI_MODEL;
    return model.startsWith('google/') ? model : `google/${model}`;
  }

  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return 'google/gemini-2.5-flash';
  }

  // Default fallback
  return 'google/gemini-2.5-flash';
}
