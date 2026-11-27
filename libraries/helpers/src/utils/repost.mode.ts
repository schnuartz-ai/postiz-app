export type RepostMode = 'off' | 'repost' | 'quote';

import { countLength } from './count.length';

export type QuoteTarget = { id: string; quoteText: string; linkId?: string };

export type QuoteAccount = { identifier: string; additionalSettings?: string | null };

export function quoteCharacterLimit(account: QuoteAccount): number {
  if (account.identifier !== 'x') return 100000;
  try {
    const settings = JSON.parse(account.additionalSettings || '[]');
    return Array.isArray(settings) && settings.some((s) => s?.title === 'Verified' && s.value === true)
      ? 4000 : 280;
  } catch {
    return 280;
  }
}

export function quoteLengthStatus(text: string, accounts: QuoteAccount[]) {
  const limits = accounts.map((account) => ({
    identifier: account.identifier,
    limit: quoteCharacterLimit(account),
    count: countLength(account.identifier, text),
  })).sort((a, b) => a.limit - b.limit);
  const limiting = limits.find((limit) => limit.count > limit.limit) || limits[0];
  return { ...limiting, valid: limits.every((limit) => limit.count <= limit.limit) };
}

export function sameQuoteCustomer(a: { customer?: { id?: string } }, b: { customer?: { id?: string } }) {
  return !!a.customer?.id && a.customer.id === b.customer?.id;
}


export function isCommentPlug(identifier: string) {
  return identifier === 'x-add-comment' || identifier === 'nostr-add-comment';
}

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
      targets.set(target.id, {
        id: target.id,
        quoteText: target.quoteText.trim(),
        ...(typeof target.linkId === 'string' && target.linkId.length <= 512 && target.linkId ? { linkId: target.linkId } : {}),
      });
    }
  }
  return [...targets.values()];
}
