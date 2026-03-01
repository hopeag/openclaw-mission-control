"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type MarkdownListResponse = { agentId: string; files: string[] };
type MarkdownContentResponse = { agentId: string; path: string; content: string };

export default function AgentMarkdownPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params?.agentId;

  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    if (!agentId) return;
    setError(null);
    const res = await fetch(`/api/v1/agents/${agentId}/markdown`, { cache: "no-store" });
    if (!res.ok) {
      setError("Failed to load markdown files");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as MarkdownListResponse;
    setFiles(data.files || []);
    if (!selected && data.files?.length) {
      setSelected(data.files[0]);
    }
    setLoading(false);
  }, [agentId, selected]);

  const loadContent = useCallback(async () => {
    if (!agentId || !selected) return;
    setError(null);
    const res = await fetch(
      `/api/v1/agents/${agentId}/markdown/content?path=${encodeURIComponent(selected)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      setError("Failed to load file content");
      return;
    }
    const data = (await res.json()) as MarkdownContentResponse;
    setContent(data.content || "");
  }, [agentId, selected]);

  const saveContent = useCallback(async () => {
    if (!agentId || !selected) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/v1/agents/${agentId}/markdown/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selected, content }),
    });
    if (!res.ok) {
      setError("Failed to save file");
    }
    setSaving(false);
  }, [agentId, selected, content]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Agent Markdown Studio ({agentId})</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" onClick={() => void loadFiles()}>Refresh Files</Button>
          <Button onClick={() => void saveContent()} disabled={saving || !selected}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Markdown Files</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <div className="space-y-1">
                {files.map((file) => (
                  <button
                    key={file}
                    type="button"
                    onClick={() => setSelected(file)}
                    className={`w-full rounded px-2 py-1 text-left text-xs ${selected === file ? "bg-slate-200" : "hover:bg-slate-100"}`}
                  >
                    {file}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-8">
          <CardHeader>
            <CardTitle className="text-base">{selected || "Select a markdown file"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[520px] font-mono text-xs"
              disabled={!selected}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
