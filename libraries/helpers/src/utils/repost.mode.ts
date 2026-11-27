export type RepostMode = 'off' | 'repost' | 'quote';

export type QuoteTarget = { id: string; quoteText: string };

export function isRepostPlug(identifier: string) {
  return identifier === 'x-repost-post-users' || identifier === 'nostr-repost-post-users';
}

// Old posts only have the boolean active flag.
export function getRepostMode(active: unknown, mode: unknown): RepostMode {
  if (active !== true) return 'off';
  if (mode === undefined || mode === 'repost') return 'repost';
  return mode === 'quote' ? 'quote' : 'off';
}

export function getQuoteTargets(value: unknown): QuoteTarget[] {
  if (!Array.isArray(value)) return [];
  const targets = new Map<string, QuoteTarget>();
  for (const target of value) {
    if (
      target && typeof target.id === 'string' && target.id &&
      typeof target.quoteText === 'string' && target.quoteText.trim()
    ) {
      targets.set(target.id, { id: target.id, quoteText: target.quoteText.trim() });
    }
  }
  return [...targets.values()];
}
