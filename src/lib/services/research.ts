/**
 * Research domain service.
 * Web-grounded nutrition/fitness queries. No HTTP concerns.
 */

import { invokeNovaWithWebGroundingOrFallback } from "@/lib/nova";

const SYSTEM_PROMPT =
  "You are a fitness and nutrition research assistant. Provide evidence-based, detailed answers about nutrition, exercise science, and body recomposition. Cite relevant studies or guidelines where applicable.";

export interface ResearchResult {
  answer: string;
  source?: string;
}

export async function researchQuery(query: string): Promise<ResearchResult> {
  const q = typeof query === "string" && query.trim() ? query.trim() : "Latest dietary guidelines for protein intake";
  const { text, source } = await invokeNovaWithWebGroundingOrFallback(SYSTEM_PROMPT, q, {
    temperature: 0.5,
    maxTokens: 1024,
  });
  return { answer: text, source };
}
