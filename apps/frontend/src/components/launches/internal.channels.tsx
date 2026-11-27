import { FC, useEffect, useRef, useState } from 'react';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { getRepostMode, getQuoteTargets, isRepostPlug, RepostMode, QuoteTarget } from '@gitroom/helpers/utils/repost.mode';
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
const delayOptions = [
  {
    name: 'Immediately',
    value: 0,
  },
  {
    name: '1 hour',
    value: 3600000,
  },
  {
    name: '2 hours',
    value: 7200000,
  },
  {
    name: '3 hours',
    value: 10800000,
  },
  {
    name: '8 hours',
    value: 28800000,
  },
  {
    name: '12 hours',
    value: 43200000,
  },
  {
    name: '15 hours',
    value: 54000000,
  },
  {
    name: '24 hours',
    value: 86400000,
  },
];
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

const QuoteEditor: FC<{
  account: Integrations;
  initialText: string;
  onSave: (text: string) => void;
  onRemove: () => void;
  onClose: () => void;
}> = ({ account, initialText, onSave, onRemove, onClose }) => {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(initialText);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={t('quote_repost', 'Quoted repost') + ': ' + account.name}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="w-[480px] max-w-[90vw] rounded-lg border border-tableBorder bg-newBgColorInner text-textColor p-[20px] backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-[12px]">
        <div className="flex items-center gap-[8px] font-semibold">
          <SafeImage src={account.picture || '/no-picture.jpg'} alt="" width={32} height={32} className="rounded-full" />
          <span>{t('quote_repost', 'Quoted repost')} · {account.name}</span>
        </div>
        <textarea
          autoFocus
          aria-label={t('quote_repost_text', 'Quote text')}
          placeholder={t('quote_repost_text', 'Quote text')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          className="w-full rounded-md border border-tableBorder bg-newBgColor p-[10px] resize-y outline-none focus:border-[#612BD3]"
        />
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
            disabled={!text.trim()}
            className="rounded-md px-[12px] py-[8px] bg-[#612BD3] text-white disabled:opacity-40"
            onClick={() => onSave(text.trim())}
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
  const t = useT();

  const { watch, setValue, control, register } = useSettings();
  const [load, setLoad] = useState(false);
  const val = watch(`plug--${plug.identifier}--integrations`);
  const active = watch(`plug--${plug.identifier}--active`);
  const supportsQuotes = isRepostPlug(plug.identifier);
  const modeName = `plug--${plug.identifier}--mode`;
  const quoteName = `plug--${plug.identifier}--quoteIntegrations`;
  const mode = getRepostMode(active, watch(modeName));
  const quoteTargets = getQuoteTargets(watch(quoteName));
  const [editingAccount, setEditingAccount] = useState<Integrations | null>(null);
  const setMode = (next: RepostMode) => {
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
  const [allowedIntegrations] = useState(
    allIntegrations.filter(
      (i) =>
        plug.pickIntegration.includes(i.identifier) && integration?.id !== i.id
    )
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
              onChange={(p) =>
                setValue(`plug--${plug.identifier}--active`, p === 'on')
              }
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
              {...register(`plug--${plug.identifier}--delay`)}
            >
              {delayOptions.map((p) => (
                <option key={p.name} value={p.value}>
                  {p.name}
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
            {supportsQuotes && mode === 'quote' ? (
              <>
                <div className="flex flex-wrap gap-[8px]">
                  {allowedIntegrations.filter((account) => !account.inBetweenSteps && !account.disabled).map((account) => {
                    const selected = quoteTargets.find((target) => target.id === account.id);
                    return (
                      <button
                        type="button"
                        key={account.id}
                        aria-label={account.name + ': ' + (selected ? t('edit_quote', 'Edit quote') : t('add_quote', 'Add quote'))}
                        aria-pressed={!!selected}
                        onClick={() => setEditingAccount(account)}
                        className={clsx(
                          'flex items-center gap-[6px] rounded-md border px-[8px] py-[6px] max-w-full',
                          selected ? 'border-[#612BD3]' : 'border-tableBorder opacity-60 hover:opacity-100'
                        )}
                      >
                        <SafeImage src={account.picture || '/no-picture.jpg'} alt="" width={28} height={28} className="rounded-full" />
                        <div className="text-start min-w-0">
                          <div className="truncate">{account.name}</div>
                          <div className="truncate opacity-70 max-w-[160px]">{selected?.quoteText || t('add_quote', 'Add quote')}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {editingAccount && (
                  <QuoteEditor
                    key={editingAccount.id}
                    account={editingAccount}
                    initialText={quoteTargets.find((target) => target.id === editingAccount.id)?.quoteText || ''}
                    onClose={() => setEditingAccount(null)}
                    onRemove={() => {
                      saveQuoteTargets(quoteTargets.filter((target) => target.id !== editingAccount.id));
                      setEditingAccount(null);
                    }}
                    onSave={(quoteText) => {
                      saveQuoteTargets([
                        ...quoteTargets.filter((target) => target.id !== editingAccount.id),
                        { id: editingAccount.id, quoteText },
                      ]);
                      setEditingAccount(null);
                    }}
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
