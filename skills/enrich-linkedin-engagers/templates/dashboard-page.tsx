import { getDb } from "@app/core";
import { TriangleAlert, Users } from "lucide-react";

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

interface RunRow {
  id: number;
  slug: string;
  source_url: string;
  status: string;
  engagers: number;
  emails: number;
  verified: number;
  excluded: number;
  not_found: number;
  skipped_urn: number;
  last_error: string | null;
  created_at: Date;
}

interface PersonRow {
  id: number;
  full_name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  verification_result: string | null;
  engagement_type: string;
  excluded_reason: string | null;
}

async function load(): Promise<
  { runs: RunRow[]; people: PersonRow[] } | { error: string }
> {
  try {
    const db = getDb();
    const runs = await db
      .selectFrom("linkedin_engager_runs")
      .select([
        "id",
        "slug",
        "source_url",
        "status",
        "engagers",
        "emails",
        "verified",
        "excluded",
        "not_found",
        "skipped_urn",
        "last_error",
        "created_at",
      ])
      .orderBy("created_at", "desc")
      .limit(20)
      .execute();
    const latest = runs[0];
    const people = latest
      ? await db
          .selectFrom("linkedin_engagers")
          .select([
            "id",
            "full_name",
            "title",
            "company",
            "email",
            "verification_result",
            "engagement_type",
            "excluded_reason",
          ])
          .where("run_id", "=", Number(latest.id))
          .orderBy("id", "asc")
          .limit(100)
          .execute()
      : [];
    return {
      runs: runs.map((run) => ({ ...run, id: Number(run.id) })),
      people: people.map((person) => ({ ...person, id: Number(person.id) })),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "database unreachable",
    };
  }
}

function statusVariant(
  status: string,
): "success" | "warning" | "destructive" | "info" | "secondary" {
  if (status === "succeeded" || status === "ok" || status === "catch_all") {
    return "success";
  }
  if (status === "waiting") return "warning";
  if (status === "failed" || status === "invalid") return "destructive";
  if (status === "running") return "info";
  return "secondary";
}

export default async function LinkedinEngagersPage() {
  const data = await load();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          LinkedIn engagers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One row per enrichment. People on the latest run are below.
        </p>
      </div>

      {"error" in data ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-400">
              <TriangleAlert className="h-4 w-4" />
              Engager tables not reachable
            </CardTitle>
            <CardDescription>{data.error}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Apply the LinkedIn engagers migration with{" "}
            <code>npm run db:migrate</code>.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Runs
              </CardTitle>
              <CardDescription>
                Written by the linkedin-engagers job and by one-off enrichments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing yet. Locally,{" "}
                  <code>npm run job:linkedin-engagers-self-check</code> writes
                  a synthetic run. The daily job writes a real one.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Engagers</TableHead>
                      <TableHead className="text-right">Emails</TableHead>
                      <TableHead className="text-right">Verified</TableHead>
                      <TableHead className="text-right">Excluded</TableHead>
                      <TableHead className="w-44 text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell>
                          <div className="font-medium text-foreground/90">
                            {run.slug}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {run.source_url}
                          </div>
                          {run.last_error ? (
                            <div className="text-xs text-amber-400">
                              {run.last_error}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(run.status)}>
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.engagers}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.emails}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.verified}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.excluded}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {new Date(run.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {data.runs[0] ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  People on {data.runs[0].slug}
                </CardTitle>
                <CardDescription>
                  {data.runs[0].not_found} not found, {data.runs[0].skipped_urn}{" "}
                  URN profiles skipped for email matching.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.people.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This run has no people stored.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Check</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.people.map((person) => (
                        <TableRow key={person.id}>
                          <TableCell>
                            <div className="text-foreground/90">
                              {person.full_name ?? "Unknown"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {person.engagement_type}
                              {person.excluded_reason
                                ? ` · ${person.excluded_reason}`
                                : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {person.title ?? ""}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {person.company ?? ""}
                          </TableCell>
                          <TableCell>{person.email ?? ""}</TableCell>
                          <TableCell>
                            {person.verification_result ? (
                              <Badge
                                variant={statusVariant(
                                  person.verification_result,
                                )}
                              >
                                {person.verification_result}
                              </Badge>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
