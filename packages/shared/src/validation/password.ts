/**
 * Password policy helpers for CreatorAi (Phase 2 proposal).
 * Anto enforces the same minimum length in the Auth API.
 */

export const MIN_PASSWORD_LENGTH = 8 as const;

export type PasswordStrengthResult = {
  /** True when password meets the MVP accept rule (length >= MIN_PASSWORD_LENGTH). */
  acceptable: boolean;
  /** 0 = too short / empty, 1 = min met, 2 = +mixed classes, 3 = stronger. */
  score: 0 | 1 | 2 | 3;
  /** Human-readable improvement hints (safe to show in UI). */
  hints: string[];
};

/**
 * MVP gate: password is acceptable iff it has at least {@link MIN_PASSWORD_LENGTH} characters.
 */
export function isPasswordAcceptable(password: string): boolean {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

/**
 * Pure strength check for UX / docs. Does not hash; does not call the network.
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const hints: string[] = [];
  const value = typeof password === 'string' ? password : '';

  if (value.length < MIN_PASSWORD_LENGTH) {
    hints.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    return { acceptable: false, score: 0, hints };
  }

  let score: 1 | 2 | 3 = 1;
  const hasLetter = /[A-Za-z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);

  if (!hasLetter || !hasDigit) {
    hints.push('Add both letters and numbers for a stronger password.');
  } else {
    score = 2;
  }

  if (!hasSymbol) {
    hints.push('Add a symbol for extra strength (optional for MVP).');
  } else if (score === 2) {
    score = 3;
  }

  if (value.length < 12) {
    hints.push('12+ characters is recommended when possible.');
  }

  return { acceptable: true, score, hints };
}
