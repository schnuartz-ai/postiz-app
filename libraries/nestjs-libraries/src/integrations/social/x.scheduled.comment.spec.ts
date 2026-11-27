process.env.JWT_SECRET = 'test-secret';

jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));
jest.mock('@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator', () => ({
  isSafePublicHttpsUrl: jest.fn(async () => true),
}));
jest.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({
  ssrfSafeDispatcher: {},
}));

import { XProvider } from './x.provider';
import { planInternalPlugs } from '@gitroom/nestjs-libraries/database/prisma/posts/internal.plug.plan';
import { runScheduledActions } from '@gitroom/helpers/utils/run.scheduled.actions';

describe('X scheduled engagement with a mocked X API', () => {
  const account = { id: 'target', token: 'target-token', additionalSettings: '[]' } as any;
  const source = { id: 'source', token: 'original-token', providerIdentifier: 'x' } as any;
  let provider: XProvider;
  let tweet: jest.Mock;
  let getClient: jest.SpyInstance;

  beforeEach(() => {
    provider = new XProvider();
    tweet = jest.fn().mockResolvedValue({ data: { id: '456' } });
    getClient = jest.spyOn(provider as any, 'getClient').mockResolvedValue({ v2: { tweet } });
    jest.spyOn(provider, 'stripLinks').mockReturnValue(false);
  });

  afterEach(() => jest.restoreAllMocks());

  it('uses the selected account token and replies to the published root', async () => {
    const actions = planInternalPlugs(source, 'org', '123', {
      'plug--x-add-comment--active': true,
      'plug--x-add-comment--delay': 0,
      'plug--x-add-comment--commentIntegrations': [{ id: 'target', quoteText: 'A reply' }],
    });
    await runScheduledActions(actions, async () => {}, async (action) => {
      expect(action.integration).toBe(account.id);
      await provider.addScheduledComment(account, source, action.post, action.information);
    });
    expect(getClient).toHaveBeenCalledWith(account.token);
    expect(tweet).toHaveBeenCalledTimes(1);
    expect(tweet).toHaveBeenCalledWith({ text: 'A reply', reply: { in_reply_to_tweet_id: '123' } });
  });

  it('rejects invalid text before making a publishing request', async () => {
    await expect(provider.addScheduledComment(account, source, '123', { comment: 'a'.repeat(281) })).rejects.toThrow();
    expect(getClient).not.toHaveBeenCalled();
    expect(tweet).not.toHaveBeenCalled();
  });

  it('does not silently retry a rejected or uncertain create', async () => {
    tweet.mockRejectedValue(new Error('connection lost'));
    await expect(provider.addScheduledComment(account, source, '123', { comment: 'A reply' })).rejects.toThrow();
    expect(tweet).toHaveBeenCalledTimes(1);
  });

  it('uses the native quote endpoint payload and skips disabled reposts', async () => {
    await provider.repostPostUsers(account, source, '123', { mode: 'off' });
    expect(getClient).not.toHaveBeenCalled();
    await provider.repostPostUsers(account, source, '123', { mode: 'quote', quoteText: 'A quote' });
    expect(tweet).toHaveBeenCalledWith({ text: 'A quote', quote_tweet_id: '123' });
  });
});
