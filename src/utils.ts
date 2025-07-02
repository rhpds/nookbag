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
  window.parent.postMessage('DELETE', '*');
}
export function restartLab() {
  window.parent.postMessage('RESTART', '*');
}
export function completeLab() {
  window.parent.postMessage('COMPLETED', '*');
}
