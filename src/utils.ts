import fetch from 'unfetch';
import { Step } from './types';

const API_PATH = '/runner/api';
export async function getJobStatus(jobId: string): Promise<{ Status: 'successful' | 'failed'; Output?: string }> {
  async function jobStatusFn() {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return getJobStatus(jobId);
  }
  const response = await fetch(`${API_PATH}/job/${jobId}`);
  const data = await response.json();
  const status = data['Status'];

  if (status) {
    if (status === 'scheduled' || status === 'running') {
      return await jobStatusFn();
    } else {
      return Promise.resolve(data);
    }
  }
  return Promise.resolve({
    Status: 'failed',
  });
}

export async function executeStage(moduleName: string, stage: Step): Promise<string | null> {
  const response = await fetch(`${API_PATH}/${moduleName}/${stage}`, { method: 'POST' });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  return data['Job_id'] ?? null;
}

export async function executeStageAndGetStatus(
  moduleName: string,
  stage: Step
): Promise<{ Status: 'failed' | 'successful'; Output?: string }> {
  const jobId = await executeStage(moduleName, stage);
  if (jobId) {
    return await getJobStatus(jobId);
  }
  return Promise.resolve({ Status: 'successful', Output: 'Script not found' });
}

export const API_CONFIG = `${API_PATH}/config`;
export const fetcher = (url: string) => fetch(url).then((r) => r.json());
export const silentFetcher = async (url: string) => {
  try {
    const res = await fetch(url);
    if (res.status === 404) {
      // Silent fail for 404
      return null;
    }
    if (!res.ok) {
      throw new Error('An error occurred while fetching the data.');
    }
    return res.json();
  } catch (err) {
    return null;
  }
};
export function exitLab() {
  window.parent.postMessage('DELETE', getParentOrigin());
}
export function restartLab() {
  window.parent.postMessage('RESTART', getParentOrigin());
}
export function completeLab() {
  window.parent.postMessage('COMPLETED', getParentOrigin());
}

export function formatYamlError(error: unknown, sourceText: string, sourceName: string): string {
  const err = error as any;
  const hasMark = err && err.mark && typeof err.mark.line === 'number' && typeof err.mark.column === 'number';
  const line = hasMark ? (err.mark.line as number) : 0;
  const column = hasMark ? (err.mark.column as number) : 0;
  const reason = (err && (err.reason || err.message)) || 'Unknown YAML parse error';
  const src = String(sourceText || '');
  const srcLines = src.split(/\r?\n/);
  const start = Math.max(0, line - 2);
  const end = Math.min(srcLines.length, line + 3);
  const lineNumWidth = String(end).length;
  const frame = [] as string[];
  for (let i = start; i < end; i++) {
    const ln = i + 1;
    const prefix = i === line ? '>' : ' ';
    const content = srcLines[i] ?? '';
    frame.push(`${prefix} ${String(ln).padStart(lineNumWidth, ' ')} | ${content}`);
    if (i === line) {
      frame.push(`  ${' '.repeat(lineNumWidth)} | ${' '.repeat(Math.max(0, column))}^`);
    }
  }
  const pretty = [
    `YAML parse error in ${sourceName}`,
    `Location: line ${line + 1}, column ${column + 1}`,
    `Reason: ${reason}`,
    '',
    frame.join('\n'),
  ].join('\n');
  return pretty;
}

function getParentOrigin(): string {
  try {
    if (typeof document !== 'undefined' && document.referrer) {
      const ref = new URL(document.referrer);
      if (ref.origin) return ref.origin;
    }
  } catch (_e) {
    // no-op
  }
  return typeof window !== 'undefined' && window.location ? window.location.origin : '*';
}
