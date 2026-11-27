import { FC, useEffect, useRef, useState } from 'react';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { getRepostMode, getQuoteTargets, isRepostPlug, isCommentPlug, RepostMode, QuoteTarget, quoteCharacterLimit, quoteLengthStatus, sameQuoteCustomer } from '@gitroom/helpers/utils/repost.mode';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import {
  Integrations,
  useCalendar,
} from '@gitroom/frontend/components/launches/calendar.context';
import { PickPlatforms } from '@gitroom/frontend/components/launches/helpers/pick.platform.component';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { Select } from '@gitroom/react/form/select';
import { Slider } from '@gitroom/react/form/slider';
import { Input } from '@gitroom/react/form/input';
import { Textarea } from '@gitroom/react/form/textarea';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { isMissingDelay, scheduledDelayOptions, withDefaultDelay } from '@gitroom/helpers/utils/scheduled.delay';
import { useDefaultDelay } from '@gitroom/frontend/components/settings/default-delay.context';

const delayOptions = scheduledDelayOptions(1);
export const InternalChannels: FC<{
  plugs: {
    identifier: string;
    title: string;
    description: string;
    pickIntegration: string[];
    fields: {
      name: string;
      description: string;
      type: string;
      placeholder: string;
      validation?: RegExp;
    }[];
  }[];
}> = (props) => {
  const { plugs } = props;
  return (
    <div>
      {plugs.map((plug, index) => (
        <Plug plug={plug} key={index} />
      ))}
    </div>
  );
};
const PlugField: FC<{
  plugIdentifier: string;
  field: {
    name: string;
    description: string;
    type: string;
    placeholder: string;
    validation?: RegExp;
  };
}> = ({ plugIdentifier, field }) => {
  const fieldName = `plug--${plugIdentifier}--${field.name}`;

  if (field.type === 'textarea') {
    return (
      <Textarea
        label={field.description}
        name={fieldName}
        placeholder={field.placeholder}
      />
    );
  }

  return (
    <Input
      label={field.description}
      name={fieldName}
      placeholder={field.placeholder}
    />
  );
};

type LinkedQuoteOption = {
  key: string;
  source: Integrations;
  account: Integrations;
  selected: boolean;
  conflict: boolean;
};

const QuoteEditor: FC<{
  account: Integrations;
  initialText: string;
  comment?: boolean;
  linkedAccounts: LinkedQuoteOption[];
  onSave: (text: string, selected: string[]) => void;
  onRemove: () => void;
  onClose: () => void;
}> = ({ account, initialText, comment = false, linkedAccounts, onSave, onRemove, onClose }) => {
  const t = useT();
  const title = comment ? t('scheduled_comment', 'Scheduled comment') : t('quote_repost', 'Quoted repost');
  const textLabel = comment ? t('comment_text', 'Comment text') : t('quote_repost_text', 'Quote text');
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(initialText);
  const [selected, setSelected] = useState(() => linkedAccounts.filter((item) => item.selected).map((item) => item.key));
  const status = quoteLengthStatus(text.trim(), [
    account,
    ...linkedAccounts.filter((item) => selected.includes(item.key)).map((item) => item.account),
  ]);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={title + ': ' + account.name}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="w-[480px] max-w-[90vw] rounded-lg border border-tableBorder bg-newBgColorInner text-textColor p-[20px] backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-[12px]">
        <div className="flex items-center gap-[8px] font-semibold">
          <SafeImage src={account.picture || '/no-picture.jpg'} alt="" width={32} height={32} className="rounded-full" />
          <span>{title} · {account.name}</span>
        </div>
        <textarea
          autoFocus
          aria-label={textLabel}
          placeholder={textLabel}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          className="w-full rounded-md border border-tableBorder bg-newBgColor p-[10px] resize-y outline-none focus:border-[#612BD3]"
        />
        <div className={clsx('text-end text-[12px]', !status.valid && 'text-red-400')} aria-live="polite">
          {status.count} / {status.limit} · {status.identifier === 'x' ? 'X' : 'Nostr'}
        </div>
        {!comment && !linkedAccounts.length && !!account.customer?.id && (
          <div className="text-[12px] opacity-70">{t('linked_quote_no_accounts', 'No matching account on another selected original channel. Select the corresponding original X or Nostr channel to link quotes.')}</div>
        )}
        {!!linkedAccounts.length && (
          <div className="flex flex-col gap-[8px] border-t border-tableBorder pt-[12px]">
            <div className="font-semibold">{t('linked_quote_accounts', 'Linked accounts')}</div>
            <div className="text-[12px] opacity-70">{t('linked_quote_accounts_description', 'Share this quote text with accounts in the same customer group. The lowest character limit applies.')}</div>
            {linkedAccounts.map((item) => (
              <label key={item.key} className={clsx('flex items-center gap-[8px] rounded-md border border-tableBorder p-[8px]', item.conflict && 'opacity-50')}>
                <SafeImage src={item.account.picture || '/no-picture.jpg'} alt="" width={28} height={28} className="rounded-full" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{item.account.name} · {item.account.identifier === 'x' ? 'X' : 'Nostr'}</div>
                  <div className="text-[11px] opacity-70">{item.conflict ? t('quote_already_configured', 'Already has a separate quote') : `${t('quotes_original', 'Quotes')}: ${item.source.name} · ${quoteCharacterLimit(item.account)}`}</div>
                </div>
                <input type="checkbox" className="accent-[#612BD3]" disabled={item.conflict} checked={selected.includes(item.key)} onChange={(event) => {
                  setSelected((previous) => event.target.checked ? [...previous, item.key] : previous.filter((key) => key !== item.key));
                }} />
              </label>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-[8px] flex-wrap">
          {!!initialText && (
            <button type="button" className="me-auto text-red-400" onClick={onRemove}>
              {t('remove', 'Remove')}
            </button>
          )}
          <button type="button" className="rounded-md px-[12px] py-[8px] border border-tableBorder" onClick={onClose}>
            {t('cancel', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={!text.trim() || !status.valid}
            className="rounded-md px-[12px] py-[8px] bg-[#612BD3] text-white disabled:opacity-40"
            onClick={() => onSave(text.trim(), selected)}
          >
            {t('save', 'Save')}
          </button>
        </div>
      </div>
    </dialog>
  );
};

const Plug: FC<{
  plug: {
    identifier: string;
    title: string;
    description: string;
    pickIntegration: string[];
    fields: {
      name: string;
      description: string;
      type: string;
      placeholder: string;
      validation?: RegExp;
    }[];
  };
}> = ({ plug }) => {
  const { allIntegrations, integration } = useIntegration();
  const sources = useLaunchStore((state) => state.selectedIntegrations);
  const t = useT();

  const { watch, setValue, getValues, register } = useSettings();
  const [load, setLoad] = useState(false);
  const delayName = `plug--${plug.identifier}--delay`;
  const defaultDelay = useDefaultDelay();
  const configuredDelay = watch(delayName);
  const val = watch(`plug--${plug.identifier}--integrations`);
  const active = watch(`plug--${plug.identifier}--active`);
  const effectiveDelay = withDefaultDelay(configuredDelay, defaultDelay, 1);
  const initializeDelay = () => {
    if (isMissingDelay(getValues(delayName))) {
      setValue(delayName, String(withDefaultDelay(undefined, defaultDelay, 1)), { shouldDirty: true });
    }
  };
  useEffect(() => {
    if (active && isMissingDelay(configuredDelay)) {
      setValue(delayName, String(effectiveDelay));
    }
  }, [active, configuredDelay, effectiveDelay, delayName, setValue]);
  const supportsQuotes = isRepostPlug(plug.identifier);
  const supportsComments = isCommentPlug(plug.identifier);
  const modeName = `plug--${plug.identifier}--mode`;
  const quoteName = `plug--${plug.identifier}--${supportsComments ? 'commentIntegrations' : 'quoteIntegrations'}`;
  const mode = getRepostMode(active, watch(modeName));
  const quoteTargets = getQuoteTargets(watch(quoteName));
  const [editingAccount, setEditingAccount] = useState<Integrations | null>(null);

  const getSourceTargets = (sourceId: string): QuoteTarget[] => {
    if (sourceId === integration?.id) return getQuoteTargets(getValues(quoteName));
    const source = sources.find((item) => item.integration.id === sourceId);
    if (!source) return [];
    return getQuoteTargets(source.ref?.current?.getValues()?.settings?.[`plug--${source.integration.identifier}-repost-post-users--quoteIntegrations`]);
  };

  const currentTarget = quoteTargets.find((target) => target.id === editingAccount?.id);
  const linkId = currentTarget?.linkId;
  const linkedAccounts: LinkedQuoteOption[] = [];
  if (supportsQuotes && editingAccount && integration && editingAccount.customer?.id) {
    const oppositeSources = sources.filter(({ integration: item }) =>
      item.identifier !== integration.identifier && ['x', 'nostr'].includes(item.identifier) &&
      !item.disabled && !item.inBetweenSteps
    );
    for (const source of sources) {
      const original = source.integration;
      if (!['x', 'nostr'].includes(original.identifier) || original.disabled || original.inBetweenSteps) continue;
      if (original.id !== integration.id && !source.ref?.current?.setQuoteSettings) continue;
      const targets = getSourceTargets(original.id);
      // A linked quote always references the original on its own platform.
      const matchingSource = sameQuoteCustomer(integration, original);
      const unambiguousSource = oppositeSources.length === 1 && oppositeSources[0].integration.id === original.id;
      for (const account of allIntegrations) {
        if (account.identifier !== original.identifier || account.id === original.id ||
            account.disabled || account.inBetweenSteps || !sameQuoteCustomer(editingAccount, account) ||
            (original.id === integration.id && account.id === editingAccount.id)) continue;
        const existing = targets.find((target) => target.id === account.id);
        const selected = !!linkId && existing?.linkId === linkId;
        if (!selected && (!(matchingSource || unambiguousSource) || account.identifier === editingAccount.identifier)) continue;
        linkedAccounts.push({
          key: JSON.stringify([original.id, account.id]),
          source: original,
          account,
          selected,
          conflict: !!existing && !selected,
        });
      }
    }
  }

  const updateLinkedQuote = (text: string, selectedKeys: string[]) => {
    if (!editingAccount || !integration) return;
    if (supportsComments) {
      const remaining = getSourceTargets(integration.id).filter((target) => target.id !== editingAccount.id);
      saveQuoteTargets(text ? [...remaining, { id: editingAccount.id, quoteText: text }] : remaining);
      setEditingAccount(null);
      return;
    }
    const selected = linkedAccounts.filter((item) => !item.conflict && selectedKeys.includes(item.key));
    const group = selected.length ? linkId || JSON.stringify([integration.id, editingAccount.id]) : undefined;
    const updates = new Map<string, QuoteTarget[]>();
    const remainingLinked = linkedAccounts.filter((item) => item.selected).length;
    const updateTarget = (sourceId: string, targetId: string, next?: QuoteTarget) => {
      const targets = (updates.get(sourceId) || getSourceTargets(sourceId)).filter((target) => target.id !== targetId);
      updates.set(sourceId, next ? [...targets, next] : targets);
    };
    updateTarget(integration.id, editingAccount.id, text ? { id: editingAccount.id, quoteText: text, ...(group ? { linkId: group } : {}) } : undefined);
    for (const option of linkedAccounts) {
      if (selected.includes(option)) {
        updateTarget(option.source.id, option.account.id, { id: option.account.id, quoteText: text, linkId: group });
      } else if (option.selected && text) {
        // Explicitly turning the counterpart off removes only its quote.
        updateTarget(option.source.id, option.account.id);
      } else if (option.selected && !text) {
        // Removing the current quote leaves the other accounts' quotes intact.
        const existing = getSourceTargets(option.source.id).find((target) => target.id === option.account.id);
        if (existing && remainingLinked === 1) updateTarget(option.source.id, option.account.id, { id: existing.id, quoteText: existing.quoteText });
      }
    }
    for (const [sourceId, targets] of updates) {
      if (sourceId === integration.id) {
        saveQuoteTargets(targets);
      } else {
        const source = sources.find((item) => item.integration.id === sourceId);
        source?.ref?.current?.setQuoteSettings(targets, selected.some((item) => item.source.id === sourceId), getValues(`plug--${plug.identifier}--delay`));
      }
    }
    setEditingAccount(null);
  };
  const setMode = (next: RepostMode) => {
    if (next !== 'off') initializeDelay();
    setValue(modeName, next, { shouldDirty: true });
    setValue(`plug--${plug.identifier}--active`, next !== 'off', { shouldDirty: true });
  };
  const saveQuoteTargets = (targets: QuoteTarget[]) =>
    setValue(quoteName, targets, { shouldDirty: true });
  useEffect(() => {
    setTimeout(() => {
      setLoad(true);
    }, 20);
  }, []);
  const [localValue, setLocalValue] = useState<Integrations[]>(
    (val || []).map((p: any) => ({
      ...p,
    }))
  );
  useEffect(() => {
    setValue(`plug--${plug.identifier}--integrations`, [...localValue]);
  }, [localValue, plug, setValue]);
  const allowedIntegrations = allIntegrations.filter(
    (i) => plug.pickIntegration.includes(i.identifier) && integration?.id !== i.id
  );
  if (!load) {
    return null;
  }
  return (
    <div
      key={plug.title}
      className="flex flex-col gap-[10px] border-tableBorder border p-[15px] rounded-lg"
    >
      <div className="flex items-center">
        <div className="flex-1">{plug.title}</div>
        <div>
          {supportsQuotes ? (
            <div className="flex rounded-md border border-tableBorder p-[2px] gap-[2px] flex-wrap" role="group" aria-label={plug.title}>
              {([
                ['off', t('off', 'Off')],
                ['repost', t('repost', 'Repost')],
                ['quote', t('quoted_reposts', 'Quoted reposts')],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={clsx(
                    'rounded px-[10px] py-[5px] text-[12px]',
                    mode === value ? 'bg-[#612BD3] text-white' : 'hover:bg-newBgColor'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <Slider
              value={active ? 'on' : 'off'}
              onChange={(p) => {
                if (p === 'on') initializeDelay();
                setValue(`plug--${plug.identifier}--active`, p === 'on');
              }}
              fill={true}
            />
          )}
        </div>
      </div>
      <div className="w-full max-w-[600px] overflow-y-auto pb-[10px] text-[12px] flex flex-col gap-[10px]">
        {!allowedIntegrations.length ? (
          'No available accounts'
        ) : (
          <div
            className={clsx(
              'flex flex-col gap-[10px]',
              !(supportsQuotes ? mode !== 'off' : active) && 'opacity-25 pointer-events-none'
            )}
          >
            <div>{plug.description}</div>
            <Select
              label="Delay"
              hideErrors={true}
              name={delayName}
              disableForm={true}
              value={String(effectiveDelay)}
              onChange={(event) => setValue(delayName, event.target.value, { shouldDirty: true })}
            >
              {!delayOptions.some((p) => p.value === effectiveDelay) && (
                <option value={effectiveDelay}>{effectiveDelay / 60000} min</option>
              )}
              {delayOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            {plug.fields.length > 0 && (
              <div className="flex flex-col gap-[10px]">
                {plug.fields.map((field) => (
                  <PlugField
                    key={field.name}
                    plugIdentifier={plug.identifier}
                    field={field}
                  />
                ))}
              </div>
            )}
            <div>
              {t('accounts_that_will_engage', 'Accounts that will engage:')}
            </div>
            {(supportsQuotes && mode === 'quote') || supportsComments ? (
              <>
                <div className="flex flex-wrap gap-[8px]">
                  {allowedIntegrations.filter((account) => !account.inBetweenSteps && !account.disabled).map((account) => {
                    const selected = quoteTargets.find((target) => target.id === account.id);
                    return (
                      <button
                        type="button"
                        key={account.id}
                        aria-label={account.name + ': ' + (supportsComments ? (selected ? t('edit_comment', 'Edit comment') : t('add_comment', 'Add comment')) : (selected ? t('edit_quote', 'Edit quote') : t('add_quote', 'Add quote')))}
                        aria-pressed={!!selected}
                        onClick={() => setEditingAccount(account)}
                        className={clsx(
                          'flex items-center gap-[6px] rounded-md border px-[8px] py-[6px] max-w-full',
                          selected ? 'border-[#612BD3]' : 'border-tableBorder opacity-60 hover:opacity-100'
                        )}
                      >
                        <SafeImage src={account.picture || '/no-picture.jpg'} alt="" width={28} height={28} className="rounded-full" />
                        <div className="text-start min-w-0">
                          <div className="truncate">{account.name}{selected?.linkId ? ' · ' + t('quote_linked', 'Linked') : ''}</div>
                          <div className="truncate opacity-70 max-w-[160px]">{selected?.quoteText || (supportsComments ? t('add_comment', 'Add comment') : t('add_quote', 'Add quote'))}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {editingAccount && (
                  <QuoteEditor
                    key={editingAccount.id}
                    account={editingAccount}
                    comment={supportsComments}
                    initialText={currentTarget?.quoteText || ''}
                    linkedAccounts={linkedAccounts}
                    onClose={() => setEditingAccount(null)}
                    onRemove={() => updateLinkedQuote('', [])}
                    onSave={updateLinkedQuote}
                  />
                )}
              </>
            ) : (
              <PickPlatforms
                hide={false}
                integrations={allowedIntegrations}
                selectedIntegrations={localValue}
                singleSelect={false}
                isMain={true}
                onChange={setLocalValue}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
