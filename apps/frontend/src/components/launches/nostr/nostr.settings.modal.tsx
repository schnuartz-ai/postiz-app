'use client';

import React, {
  FC,
  KeyboardEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import clsx from 'clsx';
import copy from 'copy-to-clipboard';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { useNostrSettings } from '@gitroom/frontend/components/launches/nostr/use.nostr.settings';

type TestState =
  | 'loading'
  | 'accepted'
  | 'rejected'
  | 'unknown'
  | 'unreachable';
type TestResult = { state: TestState; reason?: string };

const RECOMMENDED_SERVERS = [
  { url: 'https://blossom.primal.net', label: 'Primal' },
  { url: 'https://blossom.einundzwanzig.space', label: 'EINUNDZWANZIG' },
  { url: 'https://blossom.nostr.build', label: 'nostr.build' },
  { url: 'https://nostr.download', label: 'nostr.download' },
  { url: 'https://files.sovbit.host', label: 'sovbit' },
];

const normalizeServer = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return (
    /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  ).replace(/\/+$/, '');
};

const normalizeRelay = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return (/^wss?:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`).replace(
    /\/+$/,
    ''
  );
};

const hostOf = (url: string) => url.replace(/^\w+:\/\//, '');

const AddRow: FC<{
  placeholder: string;
  onAdd: (value: string) => void;
}> = ({ placeholder, onAdd }) => {
  const t = useT();
  const [value, setValue] = useState('');

  const add = useCallback(() => {
    if (!value.trim()) {
      return;
    }
    onAdd(value);
    setValue('');
  }, [value, onAdd]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    },
    [add]
  );

  return (
    <div className="flex gap-[8px]">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="flex-1 h-[40px] px-[14px] text-[14px] text-textColor bg-newBgColorInner border border-newTableBorder rounded-[8px] outline-none"
      />
      <Button secondary={true} onClick={add} className="rounded-[8px]">
        {t('nostr_add', 'Add')}
      </Button>
    </div>
  );
};

const Badge: FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => (
  <span
    className={clsx(
      'text-[11px] leading-none px-[8px] py-[4px] rounded-full',
      className
    )}
  >
    {children}
  </span>
);

const TestBadge: FC<{ result?: TestResult }> = ({ result }) => {
  const t = useT();
  if (!result) {
    return null;
  }

  const texts: Record<TestState, string> = {
    loading: t('nostr_test_loading', 'Checking...'),
    accepted: t('nostr_test_accepted', 'Accepts uploads'),
    rejected: t('nostr_test_rejected', 'Refuses this key'),
    unknown: t('nostr_test_unknown', 'Reachable, no upload check'),
    unreachable: t('nostr_test_unreachable', 'Not reachable'),
  };

  return (
    <span
      title={result.reason}
      className={clsx(
        'text-[12px]',
        result.state === 'accepted' && 'text-green-400',
        (result.state === 'rejected' || result.state === 'unreachable') &&
          'text-red-400',
        (result.state === 'unknown' || result.state === 'loading') &&
          'opacity-70'
      )}
    >
      {texts[result.state]}
      {result.state === 'rejected' && result.reason ? `: ${result.reason}` : ''}
    </span>
  );
};

export const NostrSettingsModal: FC<{
  integrationId: string;
  onClose: () => void;
}> = (props) => {
  const { integrationId, onClose } = props;
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, isLoading, mutate } = useNostrSettings(integrationId);

  const [servers, setServers] = useState<string[] | undefined>(undefined);
  const [relays, setRelays] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const test = useCallback(
    async (server: string) => {
      setResults((all) => ({ ...all, [server]: { state: 'loading' } }));
      let result: TestResult = { state: 'unreachable' };
      try {
        const response = await (
          await fetch('/integrations/function', {
            method: 'POST',
            body: JSON.stringify({
              name: 'testBlossomServer',
              id: integrationId,
              data: { server },
            }),
          })
        ).json();
        if (response?.state) {
          result = response;
        }
      } catch {
        /** stays unreachable **/
      }
      setResults((all) => ({ ...all, [server]: result }));
    },
    [integrationId]
  );

  // fill the form once, then check every server so you see right away which ones take uploads
  useEffect(() => {
    if (!data || servers !== undefined) {
      return;
    }
    setServers(data.blossomServers);
    setRelays(data.relays);
    data.blossomServers.forEach((server) => {
      test(server);
    });
  }, [data]);

  const addServer = useCallback(
    (value: string) => {
      const server = normalizeServer(value);
      if (!/^https:\/\/[^\s/]+/.test(server)) {
        toaster.show(
          t('nostr_server_https', 'The server needs to start with https://'),
          'warning'
        );
        return;
      }
      setServers((list) =>
        (list || []).includes(server) ? list : [...(list || []), server]
      );
      test(server);
    },
    [test, t]
  );

  const removeServer = useCallback((server: string) => {
    setServers((list) => (list || []).filter((p) => p !== server));
  }, []);

  const makePrimary = useCallback((server: string) => {
    setServers((list) => [server, ...(list || []).filter((p) => p !== server)]);
  }, []);

  const addRelay = useCallback(
    (value: string) => {
      const relay = normalizeRelay(value);
      if (!/^wss:\/\/[^\s/]+/.test(relay)) {
        toaster.show(
          t('nostr_relay_wss', 'The relay needs to start with wss://'),
          'warning'
        );
        return;
      }
      setRelays((list) => (list.includes(relay) ? list : [...list, relay]));
    },
    [t]
  );

  const removeRelay = useCallback((relay: string) => {
    setRelays((list) => list.filter((p) => p !== relay));
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const response = await fetch(
        `/integrations/${integrationId}/nostr-settings`,
        {
          method: 'POST',
          body: JSON.stringify({ blossomServers: servers || [], relays }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        toaster.show(
          error?.message || t('nostr_save_failed', 'Could not save'),
          'warning'
        );
        return false;
      }

      const saved = await response.json();
      setServers(saved.blossomServers);
      setRelays(saved.relays);
      await mutate();
      return true;
    } finally {
      setSaving(false);
    }
  }, [integrationId, servers, relays, t]);

  const saveAndClose = useCallback(async () => {
    if (await save()) {
      toaster.show(t('settings_updated', 'Settings Updated'), 'success');
      onClose();
    }
  }, [save, onClose, t]);

  const publishServerList = useCallback(async () => {
    setPublishing(true);
    try {
      // the list that is published is the saved one
      if (!(await save())) {
        return;
      }

      const result = await (
        await fetch('/integrations/function', {
          method: 'POST',
          body: JSON.stringify({
            name: 'publishBlossomServerList',
            id: integrationId,
            data: {},
          }),
        })
      ).json();

      toaster.show(
        result?.ok
          ? t('nostr_server_list_published', 'Server list published on Nostr')
          : result?.reason ||
              t(
                'nostr_server_list_failed',
                'Could not publish the server list'
              ),
        result?.ok ? 'success' : 'warning'
      );
    } finally {
      setPublishing(false);
    }
  }, [save, integrationId, t]);

  const copyNpub = useCallback(() => {
    copy(data?.npub || '');
    toaster.show(t('nostr_key_copied', 'Key copied to clipboard'), 'success');
  }, [data, t]);

  if (isLoading || !data || servers === undefined) {
    return (
      <div className="text-[14px] opacity-70 py-[20px]">
        {t('loading', 'Loading')}...
      </div>
    );
  }

  const suggestions = RECOMMENDED_SERVERS.filter(
    (p) => !servers.includes(p.url)
  );

  return (
    <div className="flex flex-col gap-[24px] w-full">
      <div className="flex flex-col gap-[6px]">
        <div className="text-[14px] font-[600]">
          {t('nostr_key_label', 'Nostr key of this channel')}
        </div>
        <div className="flex items-center gap-[8px]">
          <code className="flex-1 min-w-0 truncate text-[13px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] py-[10px]">
            {data.npub}
          </code>
          <Button secondary={true} onClick={copyNpub} className="rounded-[8px]">
            {t('nostr_copy', 'Copy')}
          </Button>
        </div>
        <div className="text-[12px] opacity-70">
          {t(
            'nostr_key_hint',
            'Servers that are only open to members (like blossom.einundzwanzig.space) need to allow this key.'
          )}
        </div>
      </div>

      <div className="flex flex-col gap-[10px]">
        <div className="text-[16px] font-[600]">
          {t('nostr_blossom_title', 'Blossom servers')}
        </div>
        <div className="text-[13px] opacity-80">
          {t(
            'nostr_blossom_description',
            'Your media is uploaded to the first server and the post links to it. All other servers get a backup copy.'
          )}
        </div>

        {data.blossomDisabledByInstance && (
          <div className="text-[13px] text-yellow-400">
            {t(
              'nostr_blossom_disabled_by_instance',
              'Blossom is switched off on this instance, posts link to the files on this server.'
            )}
          </div>
        )}

        {servers.length === 0 && (
          <div className="text-[13px] opacity-70">
            {t('nostr_no_server', 'No server: media stays on this instance.')}
          </div>
        )}

        {servers.map((server, index) => (
          <div
            key={server}
            className="flex flex-col gap-[8px] bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[12px]"
          >
            <div className="flex items-center gap-[8px] flex-wrap">
              <span className="text-[14px] font-[600] break-all">
                {hostOf(server)}
              </span>
              {index === 0 ? (
                <Badge className="bg-forth text-white">
                  {t('nostr_primary', 'Primary')}
                </Badge>
              ) : (
                <Badge className="bg-newTableHeader text-textColor">
                  {t('nostr_backup', 'Backup')}
                </Badge>
              )}
              <TestBadge result={results[server]} />
            </div>
            <div className="flex gap-[16px] text-[13px]">
              <button
                type="button"
                className="underline opacity-80 hover:opacity-100"
                onClick={() => test(server)}
              >
                {t('nostr_test', 'Test')}
              </button>
              {index !== 0 && (
                <button
                  type="button"
                  className="underline opacity-80 hover:opacity-100"
                  onClick={() => makePrimary(server)}
                >
                  {t('nostr_make_primary', 'Make primary')}
                </button>
              )}
              <button
                type="button"
                className="underline text-red-400 opacity-80 hover:opacity-100"
                onClick={() => removeServer(server)}
              >
                {t('nostr_remove', 'Remove')}
              </button>
            </div>
          </div>
        ))}

        <AddRow
          placeholder={t(
            'nostr_add_server_placeholder',
            'Add server (https://...)'
          )}
          onAdd={addServer}
        />

        {suggestions.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <div className="text-[12px] opacity-70">
              {t('nostr_recommended', 'Recommended servers')}
            </div>
            <div className="flex flex-wrap gap-[8px]">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.url}
                  type="button"
                  onClick={() => addServer(suggestion.url)}
                  className="text-[12px] px-[10px] py-[6px] rounded-full bg-newTableHeader text-textColor hover:opacity-80"
                >
                  + {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-[10px]">
        <div className="text-[16px] font-[600]">
          {t('nostr_relays_title', 'Relays')}
        </div>
        <div className="text-[13px] opacity-80">
          {t(
            'nostr_relays_description',
            'Additional relays your posts are published to. The default relays and your own relay list (NIP-65) are always used.'
          )}
        </div>

        {relays.map((relay) => (
          <div
            key={relay}
            className="flex items-center justify-between gap-[8px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] py-[10px]"
          >
            <span className="text-[14px] break-all">{hostOf(relay)}</span>
            <button
              type="button"
              className="text-[13px] underline text-red-400 opacity-80 hover:opacity-100"
              onClick={() => removeRelay(relay)}
            >
              {t('nostr_remove', 'Remove')}
            </button>
          </div>
        ))}

        <AddRow
          placeholder={t(
            'nostr_add_relay_placeholder',
            'Add relay (wss://...)'
          )}
          onAdd={addRelay}
        />
      </div>

      <div className="flex flex-col gap-[10px]">
        <div className="flex gap-[10px] flex-wrap">
          <Button onClick={saveAndClose} loading={saving && !publishing}>
            {t('save', 'Save')}
          </Button>
          <Button
            secondary={true}
            onClick={publishServerList}
            loading={publishing}
            disabled={servers.length === 0}
          >
            {t('nostr_publish_server_list', 'Publish server list on Nostr')}
          </Button>
        </div>
        <div className="text-[12px] opacity-70">
          {t(
            'nostr_publish_hint',
            'The list is public. Other Nostr apps use it to find your backup copies when a link stops working.'
          )}
        </div>
      </div>
    </div>
  );
};
