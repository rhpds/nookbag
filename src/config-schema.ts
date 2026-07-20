import * as v from 'valibot';

const PortSchema = v.union([v.string(), v.pipe(v.number(), v.transform(String))]);

export const ViewModeSchema = v.picklist(['instructions', 'split', 'tabs']);

export const TabSchema = v.looseObject({
  name: v.string(),
  url: v.optional(v.string()),
  external: v.optional(v.boolean()),
  port: v.optional(PortSchema),
  path: v.optional(v.string()),
  secondary_name: v.optional(v.string()),
  secondary_port: v.optional(PortSchema),
  secondary_path: v.optional(v.string()),
  secondary_url: v.optional(v.string()),
  modules: v.optional(v.array(v.string())),
  type: v.optional(v.picklist(['double-terminal', 'terminal', 'secondary-terminal', 'codeserver', 'parasol'])),
});

export const ModuleSchema = v.looseObject({
  name: v.string(),
  scripts: v.optional(v.array(v.picklist(['setup', 'validation', 'solve']))),
  label: v.optional(v.string()),
  solveButton: v.optional(v.boolean()),
});

const ViewSwitcherSchema = v.union([
  v.boolean(),
  v.object({
    enabled: v.optional(v.boolean()),
    default_mode: v.optional(ViewModeSchema),
  }),
]);

export const ConfigSchema = v.looseObject({
  type: v.optional(v.picklist(['showroom', 'zerotouch', 'zero-touch'])),
  antora: v.optional(v.looseObject({
    modules: v.array(ModuleSchema),
    name: v.optional(v.string()),
    dir: v.optional(v.string()),
    version: v.optional(v.string()),
  })),
  tabs: v.optional(v.array(TabSchema)),
  default_width: v.optional(v.number()),
  skipModuleEnabled: v.optional(v.boolean()),
  persist_url_state: v.optional(v.boolean()),
  persistUrlState: v.optional(v.boolean()),
  view_switcher: v.optional(ViewSwitcherSchema),
});

export type TConfig = v.InferOutput<typeof ConfigSchema>;
export type TTab = v.InferOutput<typeof TabSchema>;
export type TModule = v.InferOutput<typeof ModuleSchema>;
export type ViewMode = v.InferOutput<typeof ViewModeSchema>;
