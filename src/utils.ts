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

export async function executeStage(moduleName: string, stage: Step): Promise<string | null> {
  const response = await fetch(`/runner/api/${moduleName}/${stage}`, { method: 'POST' });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  return data['Job_id'] ?? null;
}

export async function executeStageAndGetStatus(
  moduleName: string,
  stage: Step
): Promise<{ Status: 'error' | 'successful'; Output?: string }> {
  const jobId = await executeStage(moduleName, stage);
  if (jobId) {
    return await getJobStatus(jobId);
  }
  return Promise.resolve({ Status: 'successful', Output: 'Script not found' });
}

export const API_CONFIG = 'http://localhost:8080/api/config';
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
