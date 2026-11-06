import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { Sparkline } from "./charts";

export function KpiCard({
  label,
  value,
  hint,
  delta,
  series,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: string | null;
  series?: number[];
}) {
  const positive = delta != null && !delta.startsWith("-");
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          <div className="flex items-center gap-2">
            {delta ? (
              <Badge variant={positive ? "success" : "warning"}>{delta}</Badge>
            ) : null}
            {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
          </div>
        </div>
        {series && series.length > 0 ? <Sparkline data={series} /> : null}
      </CardContent>
    </Card>
  );
}
