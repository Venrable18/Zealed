import type { PrivacyStrength } from './types.ts'

/**
 * Privacy strength from the number of pieces (separate payments) the pot has received. A
 * contributor sends at most 6 pieces, so under 6 pieces a single guest could account for
 * everything and the total reveals more. These cut-offs are a heuristic, not a guarantee.
 */
export const MEDIUM_FROM_PIECES = 6
export const STRONG_FROM_PIECES = 24

export function privacyStrength(pieces: number): PrivacyStrength {
  if (pieces <= 0) return 'none'
  if (pieces < MEDIUM_FROM_PIECES) return 'weak'
  if (pieces < STRONG_FROM_PIECES) return 'medium'
  return 'strong'
}

export const STRENGTH_TEXT: Record<PrivacyStrength, { label: string; detail: string }> = {
  none: { label: 'No gifts yet', detail: 'Privacy strength appears once gifts arrive.' },
  weak: {
    label: 'Weak',
    detail: 'Only a few payments so far. The total could be traced to one or two guests.',
  },
  medium: { label: 'Medium', detail: 'Enough payments that single gifts are hard to pick out.' },
  strong: { label: 'Strong', detail: 'Many payments, so individual gifts are well hidden.' },
}
