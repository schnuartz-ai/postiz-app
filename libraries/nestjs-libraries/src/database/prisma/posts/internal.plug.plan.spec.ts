import { planInternalPlugs, validateTextEngagements } from './internal.plug.plan';
import { runScheduledActions } from '@gitroom/helpers/utils/run.scheduled.actions';
import { RANDOM_30_MINUTES, MINUTE_MS } from '@gitroom/helpers/utils/scheduled.delay';

const source = { id: 'source', providerIdentifier: 'x' };
const settings = {
  'plug--x-add-comment--active': true,
  'plug--x-add-comment--delay': RANDOM_30_MINUTES,
  'plug--x-add-comment--commentIntegrations': [
    { id: 'a', quoteText: 'one' },
    { id: 'b', quoteText: 'two' },
    { id: 'source', quoteText: 'self' },
  ],
  'plug--x-repost-post-users--active': true,
  'plug--x-repost-post-users--mode': 'quote',
  'plug--x-repost-post-users--delay': 60 * MINUTE_MS,
  'plug--x-repost-post-users--quoteIntegrations': [{ id: 'a', quoteText: 'quote' }],
  'plug--nostr-add-comment--active': true,
  'plug--nostr-add-comment--commentIntegrations': [{ id: 'foreign', quoteText: 'wrong platform' }],
};

describe('internal engagement planning and dispatch', () => {
  afterEach(() => jest.useRealTimers());
  it('runs each action at its own offset with the correct account and text', async () => {
    jest.useFakeTimers();
    const random = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.5);
    const actions = planInternalPlugs(source, 'org', 'root', settings, random);
    expect(random).toHaveBeenCalledTimes(2);
    expect(actions.map(({ integration, delay, information }) => ({ integration, delay, information }))).toEqual([
      { integration: 'a', delay: 0, information: { comment: 'one' } },
      { integration: 'b', delay: 15 * MINUTE_MS, information: { comment: 'two' } },
      { integration: 'a', delay: 60 * MINUTE_MS, information: { mode: 'quote', quoteText: 'quote' } },
    ]);
    const send = jest.fn(async (_action: typeof actions[number]) => {});
    const started = Date.now();
    const execution = runScheduledActions(actions, (ms) => new Promise((resolve) => setTimeout(resolve, ms)), send, () => Date.now() - started);
    expect(send.mock.calls.map(([a]) => a.integration)).toEqual(['a']);
    await jest.advanceTimersByTimeAsync(15 * MINUTE_MS);
    expect(send.mock.calls.map(([a]) => a.integration)).toEqual(['a', 'b']);
    await jest.advanceTimersByTimeAsync(45 * MINUTE_MS);
    await execution;
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2][0]).toMatchObject({ post: 'root', orgId: 'org', originalIntegration: 'source', information: { quoteText: 'quote' } });
  });

  it('never dispatches disabled plugs and preserves legacy reposts', () => {
    const legacy = { 'plug--x-repost-post-users--active': true, 'plug--x-repost-post-users--delay': '3600000', 'plug--x-repost-post-users--integrations': [{ id: 'a' }, { id: 'a' }] };
    expect(planInternalPlugs(source, 'org', 'root', { ...settings, 'plug--x-add-comment--active': false, 'plug--x-repost-post-users--active': false })).toEqual([]);
    expect(planInternalPlugs(source, 'org', 'root', legacy)).toMatchObject([{ integration: 'a', delay: 3600000, information: { mode: 'repost' } }]);
  });

  it('reuses account lookups and rejects unavailable or over-limit accounts', async () => {
    const getAccount = jest.fn(async (id: string) => ({ id, name: id, providerIdentifier: 'x' }));
    expect(await validateTextEngagements(source, settings, getAccount)).toBe('');
    expect(getAccount).toHaveBeenCalledTimes(2);
    expect(await validateTextEngagements(source, settings, async (id) => ({ id, name: id, providerIdentifier: 'nostr' }))).toContain('no longer available');
    expect(await validateTextEngagements(source, { ...settings, 'plug--x-add-comment--commentIntegrations': [{ id: 'a', quoteText: 'a'.repeat(281) }] }, getAccount)).toContain('280');
  });
});
