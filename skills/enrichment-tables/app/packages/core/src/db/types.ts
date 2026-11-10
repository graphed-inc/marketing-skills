import type { ColumnType, Generated } from "kysely";

type Json = ColumnType<unknown, unknown, unknown>;

export interface TablesTable {
  id: Generated<number>;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ColumnsTable {
  id: Generated<number>;
  table_id: number;
  name: string;
  type: string;
  config: Json;
  position: number;
  auto_run: Generated<boolean>;
  width: Generated<number>;
  created_at: Generated<Date>;
}

export interface RowsTable {
  id: Generated<string>;
  table_id: number;
  source_key: string | null;
  created_at: Generated<Date>;
}

export interface CellsTable {
  row_id: string;
  column_id: number;
  display: string | null;
  value: Json;
  status: Generated<string>;
  error: string | null;
  attempt: Generated<number>;
  billed_attempt: Generated<number>;
  credits: Generated<number>;
  rerun: Generated<boolean>;
  updated_at: Generated<Date>;
  heartbeat_at: Date | null;
}

export interface SourcesTable {
  id: Generated<number>;
  table_id: number;
  source: string;
  input: Json;
  status: Generated<string>;
  error: string | null;
  added: Generated<number>;
  credits: Generated<number>;
  created_at: Generated<Date>;
  heartbeat_at: Date | null;
}

export interface MetaTable {
  key: string;
  value: string;
}

// The single source of truth for table types. Dashboard routes and the worker
// both query through this. (Kysely tracks applied migrations in its own
// kysely_migration table, which is intentionally not part of this schema.)
export interface Database {
  tables: TablesTable;
  columns: ColumnsTable;
  rows: RowsTable;
  cells: CellsTable;
  sources: SourcesTable;
  meta: MetaTable;
}
