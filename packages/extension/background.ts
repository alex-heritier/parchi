import { BackgroundService } from './background/service.js';

declare const __PERF_DEBUG__: boolean;

const service = new BackgroundService();

if (__PERF_DEBUG__) {
  import('./utils/perf-monitor-bg.js').then(({ bgPerfMonitor }) => {
    bgPerfMonitor.bind(service);
    bgPerfMonitor.start();
  });
}
