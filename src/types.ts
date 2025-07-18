export type TTab = {
  name: string;
  url?: string;
  external?: boolean;
  port?: string;
  path?: string;
  secondary_name?: string;
  secondary_port?: string;
  secondary_path?: string;
  secondary_url?: string;
  modules?: string[];
  type?: 'double-terminal' | 'terminal' | 'secondary-terminal' | 'codeserver' | 'parasol';
};
export type TProgress = {
  inProgress: any[];
  completed: any[];
  notStarted: string[];
  current: string;
};
export type Step = 'setup' | 'validation' | 'solve';
export type ModuleSteps = {
  [key: string]: Step[];
};
export type TModule = { name: string; scripts?: Step[]; label?: string; solveButton?: boolean };
