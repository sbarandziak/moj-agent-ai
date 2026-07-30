// Multilayer defense: input validation, output filtering, rate limiting

// ============================================================================
// 1. INPUT VALIDATION
// ============================================================================

const BLACKLIST_PHRASES = [
  "ignore previous",
  "system prompt",
  "ignore instructions",
  "reveal",
  "show me your",
  "translate your prompt",
];

const DANGEROUS_PATTERNS = [
  /\x00/g, // null bytes
  /​/g, // zero-width space
  /‌/g, // zero-width non-joiner
  /‍/g, // zero-width joiner
  /﻿/g, // zero-width no-break space
];

export function validateInput(text: string): { valid: boolean; reason?: string } {
  if (!text) return { valid: false, reason: "Wiadomość nie może być pusta." };

  // Check length
  if (text.length > 2000) {
    return { valid: false, reason: "Wiadomość przekracza limit 2000 znaków." };
  }

  // Check blacklist
  const lowerText = text.toLowerCase();
  for (const phrase of BLACKLIST_PHRASES) {
    if (lowerText.includes(phrase)) {
      return {
        valid: false,
        reason: "Ta wiadomość została zablokowana z powodów bezpieczeństwa.",
      };
    }
  }

  // Sanitize control characters
  let sanitized = text;
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }

  // If too many characters were removed, it was suspicious
  if (text.length - sanitized.length > 10) {
    return {
      valid: false,
      reason: "Ta wiadomość zawiera podejrzane znaki kontrolne i została zablokowana.",
    };
  }

  return { valid: true };
}

// ============================================================================
// 2. OUTPUT FILTERING
// ============================================================================

const LEAK_PATTERNS = [
  /api[_-]?key/i,
  /supabase[_-]?url/i,
  /secret[_-]?key/i,
  /database[_-]?url/i,
  /system[_-]?prompt/i,
  /bearer\s+[a-z0-9]+/i,
  /authorization:\s*bearer/i,
  /token[=:]\s*[a-z0-9]+/i,
];

export function filterOutput(text: string): { safe: boolean; text: string } {
  for (const pattern of LEAK_PATTERNS) {
    if (pattern.test(text)) {
      return {
        safe: false,
        text: "Przepraszam, nie mogę udostępnić tych informacji.",
      };
    }
  }
  return { safe: true, text };
}

// ============================================================================
// 3. RATE LIMITING (in-memory, per user, per hour)
// ============================================================================

const MESSAGE_LOG = new Map<string, number[]>(); // userId -> timestamps

export function checkRateLimit(userId: string): { allowed: boolean; minutesUntilReset?: number } {
  if (!userId) {
    // No user ID = no rate limiting (might be demo/test)
    return { allowed: true };
  }

  const now = Date.now();
  const oneHourAgo = now - 3600 * 1000;

  // Get or create user's message timestamps
  let timestamps = MESSAGE_LOG.get(userId) ?? [];

  // Remove timestamps older than 1 hour
  timestamps = timestamps.filter((ts) => ts > oneHourAgo);

  // Check limit
  const LIMIT = 50;
  if (timestamps.length >= LIMIT) {
    const oldestInWindow = timestamps[0];
    const minutesUntilReset = Math.ceil((oldestInWindow + 3600 * 1000 - now) / 60000);
    return {
      allowed: false,
      minutesUntilReset: Math.max(1, minutesUntilReset),
    };
  }

  // Add current timestamp
  timestamps.push(now);
  MESSAGE_LOG.set(userId, timestamps);

  return { allowed: true };
}
