import { getDb } from "@app/core";
import { Database, HeartPulse, TriangleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

interface OverviewData {
  total: number;
  latest: { id: number; message: string; created_at: Date }[];
}

async function loadOverview(): Promise<OverviewData | { error: string }> {
  try {
    const db = getDb();
    const latest = await db
      .selectFrom("example_heartbeats")
      .select(["id", "message", "created_at"])
      .orderBy("id", "desc")
      .limit(10)
      .execute();
    const countRow = await db
      .selectFrom("example_heartbeats")
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();
    return { total: Number(countRow.count), latest };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "database unreachable",
    };
  }
}

export default async function OverviewPage() {
  const data = await loadOverview();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          __PROJECT_NAME__ — one database, one cron job, this dashboard.
        </p>
      </div>

      {"error" in data ? (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Database not reachable</AlertTitle>
          <AlertDescription>
            <p>{data.error}</p>
            <p className="mt-2">
              Locally: <code>docker compose up -d</code> then{" "}
              <code>npm run db:migrate</code>. In the cloud the database is
              provisioned from <code>graphed.yaml</code>.
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Database</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Badge variant="success">Connected</Badge>
                <p className="text-xs text-muted-foreground">Primary Postgres</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Job heartbeats
                </CardTitle>
                <HeartPulse className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {data.total}
                </div>
                <p className="text-xs text-muted-foreground">
                  Rows in example_heartbeats
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Latest heartbeats</CardTitle>
              <CardDescription>
                Written by the example-daily cron job.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.latest.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-10 text-center">
                  <p className="text-sm font-medium">No heartbeats yet</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Run <code>npm run job:example-daily</code> locally or{" "}
                    <code>graphed jobs run example-daily</code> in the cloud.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Message</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.latest.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.message}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {new Date(row.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a capability</CardTitle>
              <CardDescription>
                Plugins register a page under the sidebar.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <code>graphed plugins list</code>, then{" "}
              <code>graphed plugins add &lt;name&gt;</code> and follow the
              staged AGENT.md.
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
