import { getRepostMode, getQuoteTargets, isRepostPlug, isCommentPlug, quoteCharacterLimit, quoteLengthStatus, sameQuoteCustomer } from '@gitroom/helpers/utils/repost.mode';

describe('repost settings', () => {
  it('only enables scheduled comment targets on X and Nostr', () => {
    expect(isCommentPlug('x-add-comment')).toBe(true);
    expect(isCommentPlug('nostr-add-comment')).toBe(true);
    expect(isCommentPlug('linkedin-add-comment')).toBe(false);
  });

  it('uses the lowest selected account limit and X weighted character counting', () => {
    const nostr = { identifier: 'nostr' };
    const x = { identifier: 'x' };
    const premium = { identifier: 'x', additionalSettings: JSON.stringify([{ title: 'Verified', value: true }]) };
    expect(quoteCharacterLimit(premium)).toBe(4000);
    expect(quoteLengthStatus('a'.repeat(281), [nostr]).valid).toBe(true);
    expect(quoteLengthStatus('a'.repeat(281), [nostr, x])).toMatchObject({ valid: false, limit: 280, identifier: 'x' });
    expect(quoteLengthStatus('a'.repeat(281), [nostr, premium]).valid).toBe(true);
    expect(quoteLengthStatus('漢'.repeat(141), [x]).valid).toBe(false);
  });

  it('uses explicit customer IDs and preserves linked quote identity', () => {
    expect(sameQuoteCustomer({}, {})).toBe(false);
    expect(sameQuoteCustomer({ customer: { id: 'a' } }, { customer: { id: 'b' } })).toBe(false);
    expect(sameQuoteCustomer({ customer: { id: 'a' } }, { customer: { id: 'a' } })).toBe(true);
    expect(getQuoteTargets([{ id: 'a', quoteText: 'shared', linkId: 'group' }])).toEqual([{ id: 'a', quoteText: 'shared', linkId: 'group' }]);
  });

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
