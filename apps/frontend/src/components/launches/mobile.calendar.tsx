'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import {
  CalendarItem,
  useCreatePost,
  usePostActions,
} from '@gitroom/frontend/components/launches/calendar';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { isUSCitizen } from '@gitroom/frontend/components/launches/helpers/isuscitizen.utils';
import { useAddProvider } from '@gitroom/frontend/components/launches/add.provider.component';
import i18next from 'i18next';

const DAY_KEY = 'YYYY-MM-DD';

type CalendarPost = ReturnType<typeof useCalendar>['posts'][number];

const useLocalDays = () => {
  const { startDate, display } = useCalendar();
  const language = i18next.resolvedLanguage || 'en';

  return useMemo(() => {
    dayjs.locale(language);
    const start = newDayjs(startDate);

    if (display === 'day') {
      return [start];
    }

    if (display === 'week') {
      return Array.from({ length: 7 }, (_, i) => start.add(i, 'day'));
    }

    // month: full weeks, Monday first (6 rows keeps the grid height stable)
    const first = start.startOf('month');
    const gridStart = first.subtract(first.isoWeekday() - 1, 'day');
    return Array.from({ length: 42 }, (_, i) => gridStart.add(i, 'day'));
  }, [startDate, display, language]);
};

const PostDots: FC<{ posts: CalendarPost[] }> = ({ posts }) => {
  if (!posts.length) {
    return <div className="h-[6px]" />;
  }
  const visible = posts.slice(0, 3);
  return (
    <div className="flex items-center justify-center gap-[3px] h-[6px]">
      {visible.map((post) => (
        <span
          key={post.id}
          className="w-[6px] h-[6px] rounded-full"
          style={{
            backgroundColor: post.tags?.[0]?.tag?.color || 'var(--new-btn-primary)',
          }}
        />
      ))}
      {posts.length > 3 && (
        <span className="text-[9px] leading-none font-[700] text-textItemBlur">
          +
        </span>
      )}
    </div>
  );
};

/**
 * Phone version of the week / month calendar. The desktop grids need ~1000px
 * of width, so on small screens we show a compact date picker (week strip or
 * month grid) and the posts of the selected day as an agenda below it.
 */
export const MobileCalendar: FC = () => {
  const t = useT();
  const user = useUser();
  const addProvider = useAddProvider();
  const createPost = useCreatePost();
  const { integrations, posts, loading, display, startDate, endDate } =
    useCalendar();
  const { editPost, deletePost, copyDebugJson, openStatistics, openMissingRelease } =
    usePostActions();

  const days = useLocalDays();
  const todayKey = newDayjs().format(DAY_KEY);

  const rangeContainsToday = useMemo(() => {
    const today = newDayjs();
    return (
      !today.isBefore(newDayjs(startDate).startOf('day')) &&
      !today.isAfter(newDayjs(endDate).endOf('day'))
    );
  }, [startDate, endDate]);

  const [selected, setSelected] = useState(() =>
    rangeContainsToday ? todayKey : newDayjs(startDate).format(DAY_KEY)
  );

  // Whenever the visible range changes, jump to today (if inside) or the first day.
  useEffect(() => {
    setSelected(
      rangeContainsToday ? todayKey : newDayjs(startDate).format(DAY_KEY)
    );
  }, [startDate, endDate, display]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const post of posts) {
      const key = dayjs.utc(post.publishDate).local().format(DAY_KEY);
      map.set(key, [...(map.get(key) || []), post]);
    }
    return map;
  }, [posts]);

  const selectedDay = useMemo(() => newDayjs(selected), [selected]);
  const selectedPosts = useMemo(
    () =>
      [...(postsByDay.get(selected) || [])].sort(
        (a, b) =>
          dayjs.utc(a.publishDate).valueOf() - dayjs.utc(b.publishDate).valueOf()
      ),
    [postsByDay, selected]
  );

  const isPastDay = selectedDay.endOf('day').isBefore(newDayjs());
  const isToday = selected === todayKey;

  const addPost = useCallback(() => {
    if (!integrations.length) {
      addProvider();
      return;
    }
    createPost(() =>
      isToday
        ? newDayjs().add(10, 'minute')
        : selectedDay.hour(10).minute(0).second(0).millisecond(0)
    );
  }, [integrations, isToday, selectedDay, createPost, addProvider]);

  const weekdayLabels = useMemo(() => {
    dayjs.locale(i18next.resolvedLanguage || 'en');
    return Array.from({ length: 7 }, (_, i) =>
      newDayjs().isoWeekday(i + 1).format('dd')
    );
  }, [i18next.resolvedLanguage]);

  const currentMonth = newDayjs(startDate).month();

  return (
    <div className="flex flex-col flex-1 gap-[14px] min-w-0">
      {display === 'week' && (
        <div className="grid grid-cols-7 gap-[4px]">
          {days.map((day) => {
            const key = day.format(DAY_KEY);
            return (
              <DayCell
                key={key}
                label={day.format('dd')}
                number={day.date()}
                active={key === selected}
                today={key === todayKey}
                posts={postsByDay.get(key) || []}
                onClick={() => setSelected(key)}
              />
            );
          })}
        </div>
      )}

      {display === 'month' && (
        <div className="flex flex-col gap-[6px]">
          <div className="grid grid-cols-7 gap-[4px]">
            {weekdayLabels.map((label, i) => (
              <div
                key={i}
                className="text-center text-[11px] font-[600] uppercase text-textItemBlur"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[4px]">
            {days.map((day) => {
              const key = day.format(DAY_KEY);
              return (
                <DayCell
                  key={key}
                  compact
                  number={day.date()}
                  muted={day.month() !== currentMonth}
                  active={key === selected}
                  today={key === todayKey}
                  posts={postsByDay.get(key) || []}
                  onClick={() => setSelected(key)}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-[12px]">
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-[600] truncate">
            {selectedDay.format(isUSCitizen() ? 'dddd, MMMM D' : 'dddd, D MMMM')}
          </div>
          <div className="text-[12px] text-textItemBlur">
            {selectedPosts.length === 0
              ? t('no_posts', 'No posts')
              : `${selectedPosts.length} ${
                  selectedPosts.length === 1
                    ? t('post', 'post')
                    : t('posts', 'posts')
                }`}
          </div>
        </div>
        {!isPastDay && (
          <button
            type="button"
            onClick={addPost}
            className="shrink-0 h-[40px] px-[14px] rounded-[10px] bg-btnPrimary text-white text-[14px] font-[600] flex items-center gap-[6px] active:opacity-80"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('add', 'Add')}
          </button>
        )}
      </div>

      <div className={clsx('flex flex-col gap-[12px]', loading && 'animate-pulse')}>
        {selectedPosts.map((post) => (
          <CalendarItem
            key={post.id}
            display="day"
            isBeforeNow={isPastDay}
            date={newDayjs(post.publishDate)}
            state={post.state}
            statistics={openStatistics(post.id)}
            missingRelease={openMissingRelease(post.id)}
            editPost={editPost(post, false)}
            duplicatePost={editPost(post, true)}
            copyDebugJson={user?.isSuperAdmin ? copyDebugJson(post) : undefined}
            post={post}
            integrations={integrations}
            deletePost={deletePost(post)}
            showTime={true}
          />
        ))}
        {!loading && selectedPosts.length === 0 && (
          <button
            type="button"
            onClick={isPastDay ? undefined : addPost}
            disabled={isPastDay}
            className="min-h-[120px] rounded-[16px] border border-dashed border-newSep text-textItemBlur text-[14px] flex items-center justify-center text-center px-[24px] enabled:active:bg-boxHover"
          >
            {isPastDay
              ? t('nothing_scheduled_here', 'Nothing was scheduled on this day')
              : t('tap_to_schedule', 'Nothing scheduled yet. Tap to create a post.')}
          </button>
        )}
      </div>
    </div>
  );
};

const DayCell: FC<{
  label?: string;
  number: number;
  active: boolean;
  today: boolean;
  muted?: boolean;
  compact?: boolean;
  posts: CalendarPost[];
  onClick: () => void;
}> = ({ label, number, active, today, muted, compact, posts, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={clsx(
      'flex flex-col items-center justify-center gap-[4px] rounded-[12px] transition-colors select-none',
      compact ? 'h-[50px]' : 'py-[10px]',
      active
        ? 'bg-boxFocused text-textItemFocused'
        : 'bg-newBgColor active:bg-boxHover',
      muted && !active && 'opacity-40'
    )}
  >
    {label && (
      <span
        className={clsx(
          'text-[11px] font-[600] uppercase',
          active ? 'text-textItemFocused' : 'text-textItemBlur'
        )}
      >
        {label}
      </span>
    )}
    <span
      className={clsx(
        'text-[15px] font-[600] leading-none',
        today &&
          !active &&
          'text-newTableTextFocused underline decoration-2 underline-offset-4'
      )}
    >
      {number}
    </span>
    <PostDots posts={posts} />
  </button>
);
