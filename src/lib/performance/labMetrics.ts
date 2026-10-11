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

export function observeLabMetrics(): () => void {
  const shifts: Array<{ startTime: number; value: number; hadRecentInput?: boolean }> = [];
  let lcp: number | null = null;
  const observers: PerformanceObserver[] = [];
  const report = () => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    console.info('[HK performance]', JSON.stringify({ path: location.pathname,
      lcpMs: lcp, cls: largestShiftSession(shifts), ttfbMs: navigation ? navigation.responseStart - navigation.startTime : null,
      supported: PerformanceObserver.supportedEntryTypes.filter(t => ['largest-contentful-paint', 'layout-shift'].includes(t)) }));
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
  return () => { report(); observers.forEach(observer => observer.disconnect()); };
}
