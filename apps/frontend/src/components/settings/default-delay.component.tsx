'use client';

import { useState } from 'react';
import { Select } from '@gitroom/react/form/select';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { SCHEDULED_DELAY_OPTIONS } from '@gitroom/helpers/utils/scheduled.delay';
import { useDefaultDelayPreference } from './default-delay.context';

export const DefaultDelaySettings = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const user = useUser();
  const { data, error, mutate } = useDefaultDelayPreference();
  const [saving, setSaving] = useState(false);

  const save = async (defaultDelay: number) => {
    setSaving(true);
    try {
      const response = await fetch('/settings/default-delay', {
        method: 'POST',
        body: JSON.stringify({ defaultDelay }),
      });
      if (!response.ok) throw new Error('Could not save default delay');
      await mutate(await response.json(), false);
      toaster.show(t('settings_updated', 'Settings updated'), 'success');
    } catch {
      toaster.show(t('default_delay_save_error', 'Could not save default delay'), 'warning');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div>{t('default_delay', 'Default Delay')}</div>
      <div className="flex items-center justify-between gap-[24px] flex-wrap">
        <div className="flex flex-col flex-1 text-[12px] text-customColor18">
          {t('default_delay_description', 'Default for new delayed comments, thread entries, reposts and other scheduled engagements across all supported channels. Existing posts and per-post choices are unchanged.')}
        </div>
        {data ? (
          <div className="w-[200px]">
            <Select name="defaultDelay" label="" disableForm hideErrors
              aria-label={t('default_delay', 'Default Delay')}
              disabled={saving || user?.role === 'USER'} value={data.defaultDelay}
              onChange={(event) => save(Number(event.target.value))}>
              {SCHEDULED_DELAY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
        ) : error ? (
          <button type="button" className="underline" onClick={() => mutate()}>{t('retry', 'Retry')}</button>
        ) : <span>{t('loading', 'Loading...')}</span>}
      </div>
    </div>
  );
};
