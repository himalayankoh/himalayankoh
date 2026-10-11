/** Optional, console-only diagnostics. No analytics transmission or storage. */
export function largestShiftSession(shifts: Array<{ startTime: number; value: number; hadRecentInput?: boolean }>): number {
  let largest = 0; let sum = 0; let first = 0; let previous = 0;
  for (const shift of shifts) {
    if (shift.hadRecentInput) continue;
    if (sum && shift.startTime - previous < 1000 && shift.startTime - first < 5000) sum += shift.value;
    else { sum = shift.value; first = shift.startTime; }
    previous = shift.startTime; largest = Math.max(largest, sum);
  }
  return largest;
}

/** Provisional lab INP: discard one worst interaction per fifty interactions. */
export function interactionLatency(durations: number[], count: number): number | null {
  if (!durations.length) return null;
  const sorted = [...durations].sort((a, b) => b - a);
  return sorted[Math.min(Math.floor(count / 50), sorted.length - 1)];
}

export function observeLabMetrics(): () => void {
  const shifts: Array<{ startTime: number; value: number; hadRecentInput?: boolean }> = [];
  let lcp: number | null = null;
  const interactions = new Map<number, number>();
  const observers: PerformanceObserver[] = [];
  const report = () => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    console.info('[HK performance]', JSON.stringify({ path: location.pathname,
      lcpMs: lcp, cls: largestShiftSession(shifts), ttfbMs: navigation ? navigation.responseStart - navigation.startTime : null,
      inpMs: interactionLatency([...interactions.values()], (performance as Performance & { interactionCount?: number }).interactionCount ?? interactions.size),
      observedInteractions: interactions.size,
      supported: PerformanceObserver.supportedEntryTypes.filter(t => ['largest-contentful-paint', 'layout-shift', 'event'].includes(t)) }));
  };
  for (const type of ['largest-contentful-paint', 'layout-shift']) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (type === 'largest-contentful-paint') lcp = entry.startTime;
        else shifts.push(entry as PerformanceEntry & { value: number; hadRecentInput: boolean });
      }
      report();
    });
    observer.observe({ type, buffered: true }); observers.push(observer);
  }
  if (PerformanceObserver.supportedEntryTypes.includes('event')) {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const event = entry as PerformanceEntry & { interactionId?: number };
        if (event.interactionId) interactions.set(event.interactionId, Math.max(interactions.get(event.interactionId) ?? 0, event.duration));
      }
      report();
    });
    observer.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit & { durationThreshold: number });
    observers.push(observer);
  }
  return () => { report(); observers.forEach(observer => observer.disconnect()); };
}
