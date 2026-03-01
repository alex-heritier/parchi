import type { AggregateRow, AuditRow } from './tab-cpu-audit-types.js';

export function toAggregateTable(rows: AggregateRow[]): string {
  if (rows.length === 0) return '_No aggregate rows captured._';
  const header = '| PID | Kind | CPU avg/max | RSS avg/max MB | Samples | Proc # | Parchi XPI | High CPU | High RSS |';
  const divider = '| ---: | :--- | ---: | ---: | ---: | ---: | :---: | ---: | ---: |';
  const body = rows
    .map((row) => {
      const procNum = row.firefoxProcNum == null ? '-' : String(row.firefoxProcNum);
      return `| ${row.pid} | ${row.browserKind} | ${row.cpuPercentAvg.toFixed(1)} / ${row.cpuPercentMax.toFixed(1)} | ${row.rssMbAvg.toFixed(1)} / ${row.rssMbMax.toFixed(1)} | ${row.sampleCount} | ${procNum} | ${row.hasParchiFirefoxXpi ? 'yes' : 'no'} | ${row.highCpuSamples} | ${row.highRssSamples} |`;
    })
    .join('\n');
  return `${header}\n${divider}\n${body}`;
}

export function toLatestRowsTable(rows: AuditRow[]): string {
  if (rows.length === 0) return '_No browser rows captured._';
  const header = '| PID | Kind | CPU% | RSS MB | Proc # | Parchi XPI | Elapsed | CPU Time |';
  const divider = '| ---: | :--- | ---: | ---: | ---: | :---: | :--- | :--- |';
  const body = rows
    .map((row) => {
      const procNum = row.firefoxProcNum == null ? '-' : String(row.firefoxProcNum);
      return `| ${row.pid} | ${row.browserKind} | ${row.cpuPercent.toFixed(1)} | ${row.rssMb.toFixed(1)} | ${procNum} | ${row.hasParchiFirefoxXpi ? 'yes' : 'no'} | ${row.elapsed} | ${row.cpuTime} |`;
    })
    .join('\n');
  return `${header}\n${divider}\n${body}`;
}
