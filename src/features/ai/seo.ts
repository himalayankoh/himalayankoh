// ============================================================================
// LUXEDGE — SHARED ONE-CLICK AI SEO (products + blog)
//
// Single generate+parse path for the "Auto SEO" buttons: runs a factual-SEO
// prompt through the configured provider chain via the secure server proxy
// (/api/ai/generate — the same proven route the product SEO tab uses), then
// extracts the JSON object. Callers map the fields onto their own entities
// (CatalogProduct or blog_posts) and save.
// ============================================================================
import { callAIProvider } from './client';
import { loadAIProviders } from './providers';

export interface SeoJson {
  seoTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  seoKeywords?: string[];
  targetKeyword?: string;
  secondaryKeywords?: string[];
  searchIntent?: string;
  recommendedCategory?: string;
  categoryRecommendationReason?: string;
  seoReviewSummary?: string;
  contentMismatchDetected?: string;
}

export async function generateSeoJson(prompt: string): Promise<SeoJson> {
  const text = await callAIProvider(
    prompt,
    loadAIProviders(),
    undefined,
    'You write honest, factual ecommerce SEO for Himalayan Koh in English. Never invent claims, prices or reviews. Return ONLY valid JSON.',
  );
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const obj = cleaned.match(/(\{[\s\S]*\})/);
  if (!obj) throw new Error('AI backend returned non-JSON text. Please retry.');
  try {
    const parsed = JSON.parse(obj[1]) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') throw new Error('AI returned no usable SEO JSON');
    return {
      seoTitle: typeof parsed.seoTitle === 'string' ? parsed.seoTitle : typeof parsed.title === 'string' ? parsed.title : undefined,
      metaDescription: typeof parsed.metaDescription === 'string' ? parsed.metaDescription : typeof parsed.description === 'string' ? parsed.description : undefined,
      focusKeyword: typeof parsed.focusKeyword === 'string' ? parsed.focusKeyword : typeof parsed.primaryKeyword === 'string' ? parsed.primaryKeyword : undefined,
      seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords.map(String) : Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
      targetKeyword: typeof parsed.targetKeyword === 'string' ? parsed.targetKeyword : undefined,
      secondaryKeywords: Array.isArray(parsed.secondaryKeywords) ? parsed.secondaryKeywords.map(String) : [],
      searchIntent: typeof parsed.searchIntent === 'string' ? parsed.searchIntent : undefined,
      recommendedCategory: typeof parsed.recommendedCategory === 'string' ? parsed.recommendedCategory : undefined,
      categoryRecommendationReason: typeof parsed.categoryRecommendationReason === 'string' ? parsed.categoryRecommendationReason : undefined,
      seoReviewSummary: typeof parsed.seoReviewSummary === 'string' ? parsed.seoReviewSummary : undefined,
      contentMismatchDetected: typeof parsed.contentMismatchDetected === 'string' ? parsed.contentMismatchDetected : undefined,
    };
  } catch {
    throw new Error('Could not parse AI response as JSON. Please retry.');
  }
}