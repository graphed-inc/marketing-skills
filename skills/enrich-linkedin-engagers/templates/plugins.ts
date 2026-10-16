// Plugin nav registry — the dashboard's extension point.
//
// Fresh scaffold: replace packages/dashboard/lib/plugins.ts with this file.
// Existing project: append the linkedin-engagers object to pluginNavEntries.
// Disabled entries stay in the codebase but are hidden from nav.

export interface PluginNavEntry {
  key: string;
  label: string;
  href: string;
  group: string;
  enabled: boolean;
}

export const pluginNavEntries: PluginNavEntry[] = [
  {
    key: "linkedin-engagers",
    label: "Engagers",
    href: "/linkedin-engagers",
    group: "LinkedIn",
    enabled: true,
  },
];
