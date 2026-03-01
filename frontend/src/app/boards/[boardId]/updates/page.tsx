"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@/api/mutator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type UpdateSnapshot = {
  checked_at?: string;
  installed_version?: string;
  latest_version?: string;
  channel?: string;
  action_needed?: boolean;
  summary?: string;
  rollback_checklist?: string[];
};

export default function BoardUpdatesPage() {
  const params = useParams<{ boardId: string }>();
  const boardId = params?.boardId;
  const [snapshot, setSnapshot] = useState<UpdateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo(() => `/api/v1/boards/${boardId}/updates`, [boardId]);

  const load = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/status`, { cache: "no-store" });
      if (!res.ok) throw new ApiError("Failed to load update status", res.status);
      setSnapshot((await res.json()) as UpdateSnapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load update status");
    } finally {
      setLoading(false);
    }
  }, [boardId, base]);

  const checkAndCreate = useCallback(async () => {
    if (!boardId) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`${base}/check-and-create`, { method: "POST" });
      if (!res.ok) throw new ApiError("Failed to check updates", res.status);
      const data = (await res.json()) as Record<string, unknown>;
      setResult(data);
      const snap = data.snapshot as UpdateSnapshot | undefined;
      if (snap) setSnapshot(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run update check");
    } finally {
      setChecking(false);
    }
  }, [boardId, base]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>OpenClaw Updates (Board {boardId})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()}>Refresh</Button>
            <Button onClick={() => void checkAndCreate()} disabled={checking}>
              {checking ? "Checking..." : "Check & Create Approval Task"}
            </Button>
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <pre className="rounded bg-muted p-3 text-xs overflow-auto">
              {JSON.stringify(snapshot ?? {}, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Last Check Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded bg-muted p-3 text-xs overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
