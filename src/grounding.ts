/**
 * Web Grounding Utilities
 * Uses Google Search grounding to verify and update package version recommendations
 */

import { GoogleGenAI } from '@google/genai';
import { getDefaultModel } from './models.js';
import { getApiKey, hasApiKey } from './config.js';

/** Result of web grounding verification */
export interface GroundingResult {
  /** Enhanced answer with verified package versions */
  enhancedAnswer: string;
  /** Sources used for verification */
  sources: string[];
  /** Web search queries executed */
  searchQueries: string[];
  /** Whether grounding was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Check if the security analysis contains version-related content worth verifying
 */
function hasVersionContent(text: string): boolean {
  // Look for patterns that indicate package versions are mentioned
  const versionPatterns = [
    /\d+\.\d+\.\d+/,           // Semver like 1.2.3
    /v\d+\.\d+/i,              // v1.2 style
    /version\s+\d+/i,          // "version 4"
    /\^[\d.]+/,                // ^1.2.3 (npm caret)
    /~[\d.]+/,                 // ~1.2.3 (npm tilde)
    /CVE-\d{4}-\d+/i,          // CVE references
    /security\s+vulnerabilit/i, // Security vulnerability mentions
    /outdated|deprecated/i,    // Outdated mentions
  ];

  return versionPatterns.some(pattern => pattern.test(text));
}

/**
 * Verify and enhance security recommendations using Google Search grounding
 */
export async function verifySecurityRecommendations(
  originalAnswer: string,
  verbose = false
): Promise<GroundingResult> {
  try {
    if (!hasApiKey()) {
      return {
        enhancedAnswer: originalAnswer,
        sources: [],
        searchQueries: [],
        success: false,
        error: 'No API key found for web grounding',
      };
    }
    const apiKey = getApiKey();

    const ai = new GoogleGenAI({ apiKey });

    // Check if the analysis contains version-related content worth verifying
    if (!hasVersionContent(originalAnswer)) {
      if (verbose) {
        console.log('[Grounding] No version-related content found to verify');
      }
      return {
        enhancedAnswer: originalAnswer,
        sources: [],
        searchQueries: [],
        success: true,
      };
    }

    if (verbose) {
      console.log('[Grounding] Verifying security recommendations with web search...');
    }

    // Let the LLM with web search identify and verify everything
    const verificationPrompt = `You are a security analyst with access to real-time web search. Review this security analysis and verify/update ALL package versions and security claims:

${originalAnswer.slice(0, 6000)}

Your task:
1. **Verify ALL package versions mentioned** - Search npm/PyPI/etc to find the ACTUAL current stable versions
2. **Check for version anomalies** - If a version seems too high (like zod@4.x when stable is 3.x), flag it
3. **Verify CVE references** - Ensure any CVEs mentioned are real and still relevant
4. **Add missing security advisories** - Search for recent vulnerabilities in the packages mentioned
5. **Correct any inaccuracies** - Fix version numbers, dates, or claims that are incorrect

IMPORTANT: Use web search to verify EVERY specific version number and security claim. Do not guess.

Output the enhanced security analysis with:
- Corrected version numbers (clearly mark corrections)
- Verified CVE references
- Any new critical vulnerabilities discovered
- Keep the same overall structure but update the facts`;

    const response = await ai.models.generateContent({
      model: getDefaultModel(),
      contents: verificationPrompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const enhancedText = response.text || originalAnswer;

    // Extract grounding metadata
    const metadata = response.candidates?.[0]?.groundingMetadata;
    const sources: string[] = [];
    const searchQueries: string[] = [];

    if (metadata) {
      if (metadata.webSearchQueries) {
        searchQueries.push(...metadata.webSearchQueries);
      }
      if (metadata.groundingChunks) {
        for (const chunk of metadata.groundingChunks) {
          if (chunk.web?.uri) {
            sources.push(chunk.web.uri);
          }
        }
      }
    }

    if (verbose) {
      console.log(`[Grounding] Complete: ${searchQueries.length} web searches, ${sources.length} sources`);
    }

    return {
      enhancedAnswer: enhancedText,
      sources: [...new Set(sources)],
      searchQueries,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      enhancedAnswer: originalAnswer,
      sources: [],
      searchQueries: [],
      success: false,
      error: `Web grounding failed: ${errorMessage}`,
    };
  }
}

/**
 * Add grounding sources footer to answer
 */
export function appendGroundingSources(answer: string, result: GroundingResult): string {
  if (!result.success || result.sources.length === 0) {
    return answer;
  }

  const sourcesSection = `

---
**Sources (verified via web search):**
${result.sources.slice(0, 5).map(s => `- ${s}`).join('\n')}
`;

  return answer + sourcesSection;
}
