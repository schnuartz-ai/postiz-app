'use client';

import { FC, ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useVisibleMenu } from '@gitroom/frontend/components/layout/top.menu';
import { BottomSheet } from '@gitroom/frontend/components/ui/bottom.sheet';
import { OrganizationList } from '@gitroom/frontend/components/layout/organization.selector';
import {
  ChangeLanguageComponent,
  LanguageComponent,
} from '@gitroom/frontend/components/layout/language.component';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

// How many entries get a slot in the tab bar. The rest lives in the "More" sheet.
const TAB_SLOTS = 4;

const isExternal = (path: string) => path.indexOf('http') === 0;

const TabItem: FC<{
  label: string;
  icon: ReactNode;
  active: boolean;
  href?: string;
  onClick?: () => void;
}> = ({ label, icon, active, href, onClick }) => {
  const inner = (
    <>
      <div
        className={clsx(
          'h-[30px] w-[56px] rounded-full flex items-center justify-center transition-colors',
          active ? 'bg-boxFocused text-textItemFocused' : 'text-textItemBlur'
        )}
      >
        {icon}
      </div>
      <div
        className={clsx(
          'text-[11px] leading-[1.1] font-[600] max-w-full truncate px-[2px]',
          active ? 'text-newTextColor' : 'text-textItemBlur'
        )}
      >
        {label}
      </div>
    </>
  );
  const className =
    'flex-1 min-w-0 flex flex-col items-center justify-center gap-[3px] pt-[8px] pb-[6px] select-none active:opacity-70';
  if (href) {
    return (
      <Link
        prefetch={true}
        href={href}
        className={className}
        aria-current={active ? 'page' : undefined}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
};

const MoreIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </svg>
);

const SheetRow: FC<{
  label: string;
  children: ReactNode;
  onClick?: () => void;
}> = ({ label, children, onClick }) => (
  <div
    onClick={onClick}
    className="flex items-center gap-[12px] min-h-[52px] px-[16px] border-t border-newBorder first:border-t-0 text-[15px] font-[500]"
  >
    <div className="flex-1">{label}</div>
    <div className="flex items-center text-textItemBlur">{children}</div>
  </div>
);

export const MobileNav: FC = () => {
  const t = useT();
  const path = usePathname();
  const modals = useModals();
  const { discordUrl } = useVariables();
  const { first, second } = useVisibleMenu();
  const [moreOpen, setMoreOpen] = useState(false);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  const openLanguage = useCallback(() => {
    modals.openModal({
      title: t('change_language', 'Change Language'),
      withCloseButton: true,
      children: <ChangeLanguageComponent />,
    });
  }, [modals, t]);

  // Close the sheet whenever the route changes.
  useEffect(() => {
    setMoreOpen(false);
  }, [path]);

  const tabs = first.slice(0, TAB_SLOTS);
  const overflow = [...first.slice(TAB_SLOTS), ...second];
  const moreActive =
    moreOpen ||
    overflow.some((item) => !isExternal(item.path) && path.indexOf(item.path) === 0);

  return (
    <>
      <nav
        id="mobile-nav"
        className="hidden mobile:flex fixed bottom-0 inset-x-0 z-[100] bg-newBgColorInner border-t border-newBorder pb-[env(safe-area-inset-bottom)] blurMe"
      >
        {tabs.map((item) => (
          <TabItem
            key={item.name}
            label={item.name}
            icon={item.icon}
            href={item.path}
            active={path.indexOf(item.path) === 0}
          />
        ))}
        <TabItem
          label={t('more', 'More')}
          icon={<MoreIcon />}
          active={moreActive}
          onClick={() => setMoreOpen(true)}
        />
      </nav>
      <BottomSheet
        open={moreOpen}
        onClose={closeMore}
        title={t('more', 'More')}
      >
        <div className="flex flex-col gap-[20px]">
          {overflow.length > 0 && (
            <div className="grid grid-cols-3 gap-[10px]">
              {overflow.map((item) => {
                const active =
                  !isExternal(item.path) && path.indexOf(item.path) === 0;
                const className = clsx(
                  'flex flex-col items-center justify-center gap-[8px] min-h-[84px] px-[6px] py-[12px] rounded-[16px] text-[12px] font-[600] text-center transition-colors active:scale-[0.98]',
                  active
                    ? 'bg-boxFocused text-textItemFocused'
                    : 'bg-newBgColor text-newTextColor'
                );
                const inner = (
                  <>
                    <div className="h-[24px] flex items-center justify-center">
                      {item.icon}
                    </div>
                    <div className="leading-[1.15]">{item.name}</div>
                  </>
                );
                if (item.onClick) {
                  return (
                    <button
                      key={item.name}
                      type="button"
                      className={className}
                      onClick={() => {
                        closeMore();
                        item.onClick!();
                      }}
                    >
                      {inner}
                    </button>
                  );
                }
                return (
                  <Link
                    key={item.name}
                    href={item.path}
                    prefetch={true}
                    className={className}
                    {...(isExternal(item.path) && {
                      target: '_blank',
                      rel: 'noreferrer',
                    })}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          )}
          <div className="rounded-[16px] bg-newBgColor overflow-hidden">
            <ModeComponent
              label={t('theme', 'Theme')}
              className="flex items-center gap-[12px] min-h-[52px] px-[16px] text-[15px] font-[500] [&>svg]:text-textItemBlur"
            />
            <SheetRow
              label={t('language', 'Language')}
              onClick={openLanguage}
            >
              <div className="pointer-events-none">
                <LanguageComponent />
              </div>
            </SheetRow>
            {!!discordUrl && (
              <SheetRow
                label={t('discord_support', 'Discord Support')}
                onClick={() => window.open(discordUrl)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                </svg>
              </SheetRow>
            )}
          </div>
          <OrganizationList />
        </div>
      </BottomSheet>
    </>
  );
};
