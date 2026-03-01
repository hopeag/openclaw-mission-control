"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type VaultDoc = { name: string; size: number; updatedAt: string };

export default function AgentVaultPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params?.agentId;

  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [query, setQuery] = useState("research");
  const [results, setResults] = useState<Array<{ name: string; snippet: string }>>([]);
  const [name, setName] = useState("research-process.md");
  const [content, setContent] = useState("Top 10% research process: objective, source diversity, cross-check, synthesis, action map.");
  const [error, setError] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    if (!agentId) return;
    setError(null);
    const res = await fetch(`/api/v1/agents/${agentId}/vault/docs`, { cache: "no-store" });
    if (!res.ok) {
      setError("Failed to load docs");
      return;
    }
    const data = (await res.json()) as { docs?: VaultDoc[] };
    setDocs(data.docs || []);
  }, [agentId]);

  const saveDoc = useCallback(async () => {
    if (!agentId) return;
    setError(null);
    const res = await fetch(`/api/v1/agents/${agentId}/vault/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content }),
    });
    if (!res.ok) {
      setError("Failed to save doc");
      return;
    }
    await loadDocs();
  }, [agentId, name, content, loadDocs]);

  const doSearch = useCallback(async () => {
    if (!agentId) return;
    setError(null);
    const res = await fetch(`/api/v1/agents/${agentId}/vault/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      setError("Failed to search vault");
      return;
    }
    const data = (await res.json()) as { results?: Array<{ name: string; snippet: string }> };
    setResults(data.results || []);
  }, [agentId, query]);

  const deleteDoc = useCallback(async (docName: string) => {
    if (!agentId) return;
    setError(null);
    const res = await fetch(`/api/v1/agents/${agentId}/vault/docs/${encodeURIComponent(docName)}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Failed to delete doc");
      return;
    }
    await loadDocs();
  }, [agentId, loadDocs]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Agent Knowledge Vault ({agentId})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="doc name" />
            <Button onClick={() => void saveDoc()}>Save / Update Doc</Button>
          </div>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[140px] text-xs" />
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search Vault</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search query" />
            <Button variant="outline" onClick={() => void doSearch()}>Search</Button>
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={`${r.name}-${i}`} className="rounded border p-2 text-xs">
                <div className="font-semibold">{r.name}</div>
                <div className="text-muted-foreground">{r.snippet}</div>
              </div>
            ))}
            {results.length === 0 ? <p className="text-xs text-muted-foreground">No results yet.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vault Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {docs.map((d) => (
            <div key={d.name} className="flex items-center justify-between rounded border px-3 py-2 text-xs">
              <div>
                <div className="font-semibold">{d.name}</div>
                <div className="text-muted-foreground">{d.size} bytes</div>
              </div>
              <Button variant="outline" onClick={() => void deleteDoc(d.name)}>Delete</Button>
            </div>
          ))}
          {docs.length === 0 ? <p className="text-xs text-muted-foreground">No docs yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
