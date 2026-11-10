// Plugin nav registry — the dashboard's extension point.
// This app's page is the enrichment spreadsheet at `/`. It has its own sidebar,
// so these entries are not drawn.

export interface PluginNavEntry {
  key: string;
  label: string;
  href: string;
  group: string;
  enabled: boolean;
}

export const pluginNavEntries: PluginNavEntry[] = [];
