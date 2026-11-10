// Plugin nav registry. This app's page is the post-engagers UI at `/`.
// It draws its own header, so these entries are not shown.

export interface PluginNavEntry {
  key: string;
  label: string;
  href: string;
  group: string;
  enabled: boolean;
}

export const pluginNavEntries: PluginNavEntry[] = [];
