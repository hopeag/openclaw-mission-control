"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@/api/mutator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type BriefResponse = {
  generated_at?: string | null;
  source_summary?: string | null;
  items?: Array<Record<string, unknown>>;
  top_actions?: Array<Record<string, unknown>>;
};

function samplePayload() {
  return {
    source_summary: "2 X + 2 web",
    items: [
      {
        source: "x",
        title: "Approval-first orchestration",
        url: "https://x.com/example/approval",
        takeaway: "Gate auto-generated work via approvals before execution.",
        implementation: "Create pending approvals for brief-generated tasks.",
        impact_score: 9,
      },
      {
        source: "web",
        title: "Agent observability pattern",
        url: "https://example.com/observability",
        takeaway: "Track live task and approval state transitions.",
        implementation: "Display board-level audit events in activity feed.",
        impact_score: 8,
      },
    ],
    top_actions: [
      {
        title: "Implement structured morning brief intake",
        description: "Run daily brief and convert top actions into approval-gated tasks.",
        source_url: "https://x.com/example/approval",
        impact_score: 9,
        priority: "high",
      },
      {
        title: "Standardize task review rubric",
        description: "Add rubric to improve approve/reject consistency.",
        source_url: "https://example.com/observability",
        impact_score: 8,
        priority: "medium",
      },
    ],
    max_tasks: 3,
  };
}

export default function MorningBriefBoardPage() {
  const params = useParams<{ boardId: string }>();
  const boardId = params?.boardId;
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(samplePayload(), null, 2));

  const endpointBase = useMemo(() => `/api/v1/boards/${boardId}/morning-brief`, [boardId]);

  const loadLatest = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${endpointBase}/latest`, { cache: "no-store" });
      if (!response.ok) throw new ApiError("Failed to load latest morning brief", response.status);
      const data = (await response.json()) as BriefResponse;
      setBrief(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load morning brief";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [boardId, endpointBase]);

  const runBrief = useCallback(async () => {
    if (!boardId) return;
    setRunning(true);
    setError(null);
    try {
      const parsed = JSON.parse(payloadText);
      const response = await fetch(`${endpointBase}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!response.ok) throw new ApiError("Failed to run morning brief", response.status);
      await loadLatest();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run morning brief";
      setError(message);
    } finally {
      setRunning(false);
    }
  }, [boardId, endpointBase, payloadText, loadLatest]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Morning Brief (Board {boardId})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ingest research signals and create approval-gated task candidates.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => void loadLatest()} variant="outline">Refresh Latest</Button>
            <Button onClick={() => void runBrief()} disabled={running}>{running ? "Running..." : "Run Brief"}</Button>
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            className="min-h-[260px] font-mono text-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest Brief Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <pre className="max-h-[360px] overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(brief ?? {}, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
