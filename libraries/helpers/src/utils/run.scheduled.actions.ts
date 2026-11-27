// All delays are absolute offsets from the same reference time. Keep the
// clock and dispatch injected so the workflow can use replay-safe timers.
export async function runScheduledActions<T extends { delay: number }>(
  actions: T[],
  wait: (ms: number) => Promise<void>,
  dispatch: (action: T) => Promise<void>,
  elapsed: () => number = () => 0
): Promise<void> {
  await Promise.all(actions.map(async (action) => {
    const remaining = Math.max(0, action.delay - elapsed());
    if (remaining > 0) await wait(remaining);
    await dispatch(action);
  }));
}
