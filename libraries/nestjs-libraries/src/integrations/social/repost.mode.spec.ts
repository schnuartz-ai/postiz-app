import { getRepostMode, getQuoteTargets, isRepostPlug } from '@gitroom/helpers/utils/repost.mode';

describe('repost settings', () => {
  it('keeps existing active reposts and makes off take precedence', () => {
    expect(getRepostMode(true, undefined)).toBe('repost');
    expect(getRepostMode(false, 'quote')).toBe('off');
    expect(getRepostMode(undefined, undefined)).toBe('off');
    expect(getRepostMode(true, 'quote')).toBe('quote');
    expect(getRepostMode(true, 'invalid')).toBe('off');
    expect(isRepostPlug('x-repost-post-users')).toBe(true);
    expect(isRepostPlug('nostr-repost-post-users')).toBe(true);
    expect(isRepostPlug('other')).toBe(false);
  });

  it('keeps independent nonblank texts and deduplicates selected accounts', () => {
    expect(getQuoteTargets([
      { id: 'a', quoteText: ' first ' },
      { id: 'b', quoteText: 'second' },
      { id: 'c', quoteText: ' ' },
      { id: 'a', quoteText: 'updated' },
      null,
    ])).toEqual([{ id: 'a', quoteText: 'updated' }, { id: 'b', quoteText: 'second' }]);
    expect(getQuoteTargets(undefined)).toEqual([]);
  });
});
