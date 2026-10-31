'use client';

import { FC, ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * Mobile-first bottom sheet. Rendered in a portal on <body> so it is never
 * clipped (or blurred) by the page layout, and sits below the regular modals
 * (z-index 200+) so a modal opened from inside a sheet always shows on top.
 */
export const BottomSheet: FC<{
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}> = ({ open, onClose, title, children, className }) => {
  const t = useT();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex flex-col justify-end text-newTextColor"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 animate-fadeIn"
        onClick={onClose}
      />
      <div
        className={clsx(
          'relative flex flex-col max-h-[88dvh] bg-newBgColorInner rounded-t-[24px] animate-sheetUp shadow-[0_-8px_40px_rgba(0,0,0,0.35)]',
          className
        )}
      >
        <div className="flex justify-center pt-[10px] pb-[2px]" onClick={onClose}>
          <div className="w-[40px] h-[4px] rounded-full bg-newSep" />
        </div>
        <div className="flex items-center gap-[12px] px-[20px] pt-[8px] pb-[12px]">
          <div className="flex-1 text-[18px] font-[600]">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', 'Close')}
            className="w-[36px] h-[36px] -me-[8px] flex items-center justify-center rounded-full text-textItemBlur active:bg-boxFocused active:text-textItemFocused"
          >
            <svg
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
            >
              <path
                d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-[20px] pb-[max(20px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
