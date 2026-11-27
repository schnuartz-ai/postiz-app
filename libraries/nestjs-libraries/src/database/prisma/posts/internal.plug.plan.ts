import { getRepostMode, getQuoteTargets, isRepostPlug, isCommentPlug, quoteLengthStatus } from '@gitroom/helpers/utils/repost.mode';
import { resolveScheduledDelay } from '@gitroom/helpers/utils/scheduled.delay';

type Source = { id: string; providerIdentifier: string };
type Account = Source & { name: string; deletedAt?: unknown; disabled?: boolean; inBetweenSteps?: boolean; additionalSettings?: string | null };
type Action = {
  type: 'internal-plug';
  post: string;
  originalIntegration: string;
  integration: string;
  plugName: string;
  orgId: string;
  delay: number;
  information: Record<string, unknown>;
};

export function isAvailableEngagementAccount(source: Source, account: Account | null | undefined): account is Account {
  return !!account && account.id !== source.id && !account.deletedAt &&
    !account.disabled && !account.inBetweenSteps && account.providerIdentifier === source.providerIdentifier;
}

function readPlugs(settings: Record<string, unknown> | null | undefined) {
  const plugs = new Map<string, Record<string, unknown>>();
  for (const [key, value] of Object.entries(settings || {})) {
    const [prefix, name, field, extra] = key.split('--');
    if (prefix !== 'plug' || !name || !field || extra !== undefined || field === 'name') continue;
    if (!plugs.has(name)) plugs.set(name, Object.create(null));
    plugs.get(name)![field] = value;
  }
  return plugs;
}

export function planInternalPlugs(source: Source, orgId: string, postId: string, settings: Record<string, unknown>, random = Math.random): Action[] {
  const actions: Action[] = [];
  for (const [name, trigger] of readPlugs(settings)) {
    const repost = isRepostPlug(name);
    const comment = isCommentPlug(name);
    const mode = repost ? getRepostMode(trigger.active, trigger.mode) : undefined;
    if (repost && (mode === 'off' || name !== `${source.providerIdentifier}-repost-post-users`)) continue;
    if (comment && (trigger.active !== true || name !== `${source.providerIdentifier}-add-comment`)) continue;
    if (!repost && !comment && trigger.active === false) continue;

    const targets = comment || mode === 'quote'
      ? getQuoteTargets(comment ? trigger.commentIntegrations : trigger.quoteIntegrations)
      : Array.isArray(trigger.integrations) ? trigger.integrations : [];
    const seen = new Set<string>();
    for (const target of targets) {
      if (!target || typeof target.id !== 'string' || !target.id || seen.has(target.id) ||
        ((repost || comment) && target.id === source.id)) continue;
      seen.add(target.id);
      actions.push({
        type: 'internal-plug',
        post: postId,
        originalIntegration: source.id,
        integration: target.id,
        plugName: name,
        orgId,
        delay: resolveScheduledDelay(trigger.delay, 1, random),
        information: comment ? { comment: target.quoteText } : repost
          ? { mode, ...(mode === 'quote' ? { quoteText: target.quoteText } : {}) }
          : { ...trigger, name },
      });
    }
  }
  return actions;
}

export async function validateTextEngagements(
  source: Source,
  settings: Record<string, unknown>,
  getAccount: (id: string) => Promise<Account | null | undefined>
): Promise<string> {
  const cache = new Map<string, Promise<Account | null | undefined>>();
  // Validation does not consume randomness or schedule anything.
  const actions = planInternalPlugs(source, '', '', settings, () => 0)
    .filter((action) => isCommentPlug(action.plugName) || action.information.mode === 'quote');
  for (const action of actions) {
    if (!cache.has(action.integration)) cache.set(action.integration, getAccount(action.integration));
    const account = await cache.get(action.integration);
    if (!isAvailableEngagementAccount(source, account)) return 'A scheduled engagement account is no longer available';
    const text = (action.information.comment || action.information.quoteText) as string;
    const status = quoteLengthStatus(text, [{ identifier: account.providerIdentifier, additionalSettings: account.additionalSettings }]);
    if (!status.valid) return `${account.name}: ${isCommentPlug(action.plugName) ? 'Comment' : 'Quote text'} exceeds ${status.limit} characters`;
  }
  return '';
}
