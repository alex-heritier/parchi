export type BrowserKind = 'firefox-tab' | 'firefox-other' | 'chrome-renderer' | 'chrome-other' | 'other';

export type ParsedProcess = {
  pid: number;
  ppid: number;
  cpuPercent: number;
  rssKb: number;
  elapsed: string;
  cpuTime: string;
  comm: string;
  args: string;
};

export type AuditRow = ParsedProcess & {
  browserKind: BrowserKind;
  firefoxProcNum: number | null;
  rssMb: number;
  hasParchiFirefoxXpi: boolean;
};

export type SampleSummary = {
  sampleIndex: number;
  capturedAt: string;
  firefoxTabs: { count: number; totalCpuPercent: number; totalRssMb: number; tabsWithParchiXpi: number };
  chromeRenderers: { count: number; totalCpuPercent: number; totalRssMb: number };
  topRows: AuditRow[];
};

export type AggregateRow = {
  pid: number;
  browserKind: BrowserKind;
  firefoxProcNum: number | null;
  hasParchiFirefoxXpi: boolean;
  sampleCount: number;
  cpuPercentAvg: number;
  cpuPercentMax: number;
  rssMbAvg: number;
  rssMbMax: number;
  highCpuSamples: number;
  highRssSamples: number;
  elapsed: string;
  cpuTime: string;
};

export type TabAuditOptions = {
  topN: number;
  sampleCount: number;
  sampleIntervalMs: number;
  cpuAlertPercent: number;
  rssAlertMb: number;
};
