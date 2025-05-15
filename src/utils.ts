import fetch from 'unfetch';
import { Step } from './types';

export async function getJobStatus(jobId: string): Promise<{ Status: 'successful' | 'error'; Output?: string }> {
  async function jobStatusFn() {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return getJobStatus(jobId);
  }
  const response = await fetch(`/runner/api/job/${jobId}`);
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
    Status: 'error',
  });
}

export async function executeStage(moduleName: string, stage: Step) {
  const response = await fetch(`/runner/api/${moduleName}/${stage}`, { method: 'POST' });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  return data['Job_id'] ?? null;
}

export async function executeStageAndGetStatus(moduleName: string, stage: Step) {
  const jobId = await executeStage(moduleName, stage);
  if (jobId) {
    return await getJobStatus(jobId);
  }
  return Promise.resolve({ Status: 'successful', Output: 'Script not found' });
}

export const API_CONFIG = '/runner/api/config';
export const fetcher = (url: string) => fetch(url).then((r) => r.json());
