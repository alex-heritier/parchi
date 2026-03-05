import { toAggregateTable, toLatestRowsTable } from './tab-cpu-audit-format.js';
import type { AggregateRow, SampleSummary, TabAuditOptions } from './tab-cpu-audit-types.js';

type BuildMarkdownArgs = {
  generatedAt: string;
  options: TabAuditOptions;
  sustainedMinSamples: number;
  latest: SampleSummary;
  samples: SampleSummary[];
  aggregateRows: AggregateRow[];
  sustainedAlerts: AggregateRow[];
  parchiRssSlopeMbPerMin: number | null;
  parchiCpuSlopePercentPerMin: number | null;
};

export function buildTabCpuAuditMarkdown({
  generatedAt,
  options,
  sustainedMinSamples,
  latest,
  samples,
  aggregateRows,
  sustainedAlerts,
  parchiRssSlopeMbPerMin,
  parchiCpuSlopePercentPerMin,
}: BuildMarkdownArgs) {
  const timelineTable = samples
    .map(
      (sample) =>
        `| ${sample.sampleIndex} | ${sample.capturedAt} | ${sample.firefoxTabs.totalCpuPercent.toFixed(1)} | ${sample.firefoxTabs.totalRssMb.toFixed(1)} | ${sample.parchiFirefoxTabs.totalCpuPercent.toFixed(1)} | ${sample.parchiFirefoxTabs.totalRssMb.toFixed(1)} | ${sample.chromeRenderers.totalCpuPercent.toFixed(1)} | ${sample.chromeRenderers.totalRssMb.toFixed(1)} |`,
    )
    .join('\n');

  return `# Browser tab CPU audit

- Generated: ${generatedAt}
- Samples: ${options.sampleCount}
- Interval: ${options.sampleIntervalMs}ms
- Top rows per sample: ${options.topN}
- CPU alert threshold: ${options.cpuAlertPercent}%
- RSS alert threshold: ${options.rssAlertMb}MB
- Sustained alert threshold: >=${sustainedMinSamples} samples

## Latest sample summary

- Firefox tab count: ${latest.firefoxTabs.count}
- Firefox tab CPU total: ${latest.firefoxTabs.totalCpuPercent.toFixed(1)}%
- Firefox tab RSS total: ${latest.firefoxTabs.totalRssMb.toFixed(1)}MB
- Firefox tabs with Parchi XPI: ${latest.firefoxTabs.tabsWithParchiXpi}
- Parchi-attributed Firefox tab count: ${latest.parchiFirefoxTabs.count}
- Parchi-attributed Firefox CPU total: ${latest.parchiFirefoxTabs.totalCpuPercent.toFixed(1)}%
- Parchi-attributed Firefox RSS total: ${latest.parchiFirefoxTabs.totalRssMb.toFixed(1)}MB
- Parchi-attributed Firefox RSS slope: ${parchiRssSlopeMbPerMin == null ? 'n/a' : `${parchiRssSlopeMbPerMin.toFixed(1)} MB/min`}
- Parchi-attributed Firefox CPU slope: ${parchiCpuSlopePercentPerMin == null ? 'n/a' : `${parchiCpuSlopePercentPerMin.toFixed(1)} %/min`}
- Chrome renderer count: ${latest.chromeRenderers.count}
- Chrome renderer CPU total: ${latest.chromeRenderers.totalCpuPercent.toFixed(1)}%
- Chrome renderer RSS total: ${latest.chromeRenderers.totalRssMb.toFixed(1)}MB

## Sustained alerts

${toAggregateTable(sustainedAlerts)}

## Top aggregated browser rows

${toAggregateTable(aggregateRows.slice(0, options.topN))}

## Top aggregated Parchi-attributed rows

${toAggregateTable(aggregateRows.filter((row) => row.hasParchiFirefoxXpi).slice(0, options.topN))}

## Latest sample top rows

${toLatestRowsTable(latest.topRows)}

## Browser timeline by sample

| Sample | Captured At | Firefox CPU% | Firefox RSS MB | Parchi CPU% | Parchi RSS MB | Chrome CPU% | Chrome RSS MB |
| ---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
${timelineTable}

## Notes

- Firefox process number maps to trailing \`N tab\` value in plugin-container args.
- \`Parchi XPI\` indicates the process has opened the extension bundle; it is a correlation signal only.
- RSS/CPU slope is derived from sample-to-sample totals for \`hasParchiFirefoxXpi=true\` Firefox tab rows.
- Run this once during active automation and once after 5+ minutes idle; sustained alerts in idle mode are regressions.
`;
}
