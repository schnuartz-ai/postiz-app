import React, { FC, useCallback } from 'react';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import dayjs from 'dayjs';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { SetSelectionModal } from '@gitroom/frontend/components/launches/calendar';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { ModalWrapperComponent } from '@gitroom/frontend/components/new-launch/modal.wrapper.component';

export const NewPost: FC<{ fab?: boolean }> = ({ fab }) => {
  const fetch = useFetch();
  const modal = useModals();
  const { integrations, reloadCalendarView, sets } = useCalendar();
  const t = useT();

  const createAPost = useCallback(async () => {
    const date = (await (await fetch('/posts/find-slot')).json()).date;

    const set: any = !sets.length
      ? undefined
      : await new Promise((resolve) => {
          modal.openModal({
            title: t('select_set', 'Select a Set'),
            closeOnClickOutside: true,
            closeOnEscape: true,
            withCloseButton: false,
            onClose: () => resolve('exit'),
            classNames: {
              modal: 'text-textColor',
            },
            children: (
              <SetSelectionModal
                sets={sets}
                onSelect={(selectedSet) => {
                  resolve(selectedSet);
                  modal.closeAll();
                }}
                onContinueWithoutSet={() => {
                  resolve(undefined);
                  modal.closeAll();
                }}
              />
            ),
          });
        });

    if (set === 'exit') return;

    modal.openModal({
      id: 'add-edit-modal',
      closeOnClickOutside: false,
      removeLayout: true,
      closeOnEscape: false,
      withCloseButton: false,
      askClose: true,
      fullScreen: true,
      classNames: {
        modal: 'w-[100%] max-w-[1400px] text-textColor',
      },
      children: (
        <AddEditModal
          allIntegrations={integrations.map((p) => ({
            ...p,
          }))}
          {...(set?.content ? { set: JSON.parse(set.content) } : {})}
          reopenModal={createAPost}
          mutate={reloadCalendarView}
          integrations={integrations}
          date={dayjs.utc(date).local()}
        />
      ),
      size: '80%',
      title: ``,
    });
  }, [integrations, sets]);
  if (fab) {
    return (
      <button
        type="button"
        onClick={createAPost}
        aria-label={t('create_new_post', 'Create Post')}
        className="fixed z-[95] end-[16px] bottom-[calc(68px+env(safe-area-inset-bottom)+16px)] w-[56px] h-[56px] rounded-full bg-btnPrimary text-white hidden mobile:flex items-center justify-center shadow-[0_8px_24px_rgba(97,43,211,0.45)] active:scale-95 transition-transform outline-none blurMe"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={createAPost}
      className="text-white flex-1 pt-[12px] pb-[14px] ps-[16px] pe-[20px] group-[.sidebar]:p-0 min-h-[44px] max-h-[44px] rounded-md bg-btnPrimary flex justify-center items-center gap-[5px] outline-none"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="21"
        height="20"
        viewBox="0 0 21 20"
        fill="none"
        className="min-w-[21px] min-h-[20px]"
      >
        <path
          d="M10.5001 4.16699V15.8337M4.66675 10.0003H16.3334"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex-1 text-start text-[14px] group-[.sidebar]:hidden">
        {t('create_new_post', 'Create Post')}
      </div>
    </button>
  );
};
