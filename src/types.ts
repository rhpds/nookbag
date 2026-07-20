export { TTab, TModule, ViewMode } from './config-schema';

export type TProgress = {
  inProgress: string[];
  completed: string[];
  notStarted: string[];
  current: string | null;
};
export type Step = 'setup' | 'validation' | 'solve';
export type ModuleSteps = {
  [key: string]: Step[];
};
