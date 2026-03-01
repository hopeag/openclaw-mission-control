"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Incident = {
  incident_id: string;
  date: string;
  what_happened: string;
  root_cause: string;
  fix_applied: string;
  prevention_rule: string;
  owner: string;
  status: string;
};

export default function BoardIncidentsPage() {
  const params = useParams<{ boardId: string }>();
  const boardId = params?.boardId;

  const [items, setItems] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    what_happened: "",
    root_cause: "",
    fix_applied: "",
    prevention_rule: "",
    owner: "AG",
    status: "implemented",
  });

  const base = useMemo(() => `/api/v1/boards/${boardId}/incidents`, [boardId]);

  const load = useCallback(async () => {
    if (!boardId) return;
    setError(null);
    const res = await fetch(base, { cache: "no-store" });
    if (!res.ok) {
      setError("Failed to load incidents");
      return;
    }
    const data = (await res.json()) as { items?: Incident[] };
    setItems(data.items || []);
  }, [boardId, base]);

  const createIncident = useCallback(async () => {
    if (!boardId) return;
    setSaving(true);
    setError(null);
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setError("Failed to create incident");
      setSaving(false);
      return;
    }
    setForm((prev) => ({ ...prev, what_happened: "", root_cause: "", fix_applied: "", prevention_rule: "" }));
    setSaving(false);
    await load();
  }, [boardId, base, form, load]);

  const removeIncident = useCallback(async (id: string) => {
    if (!boardId) return;
    const res = await fetch(`${base}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Failed to delete incident");
      return;
    }
    await load();
  }, [boardId, base, load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Learning from Mistakes (Board {boardId})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="What happened" value={form.what_happened} onChange={(e) => setForm({ ...form, what_happened: e.target.value })} />
          <Textarea placeholder="Root cause" value={form.root_cause} onChange={(e) => setForm({ ...form, root_cause: e.target.value })} className="min-h-[80px]" />
          <Textarea placeholder="Fix applied" value={form.fix_applied} onChange={(e) => setForm({ ...form, fix_applied: e.target.value })} className="min-h-[80px]" />
          <Textarea placeholder="Prevention rule" value={form.prevention_rule} onChange={(e) => setForm({ ...form, prevention_rule: e.target.value })} className="min-h-[80px]" />
          <div className="flex gap-2">
            <Input placeholder="Owner" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            <Input placeholder="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          </div>
          <Button onClick={() => void createIncident()} disabled={saving}>{saving ? "Saving..." : "Log Incident"}</Button>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Incident Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((it) => (
            <div key={it.incident_id} className="rounded border p-3 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">{it.what_happened}</span>
                <Button variant="outline" onClick={() => void removeIncident(it.incident_id)}>Delete</Button>
              </div>
              <div><span className="font-semibold">Root cause:</span> {it.root_cause}</div>
              <div><span className="font-semibold">Fix:</span> {it.fix_applied}</div>
              <div><span className="font-semibold">Prevention:</span> {it.prevention_rule}</div>
              <div className="text-muted-foreground">{it.owner} · {it.status} · {new Date(it.date).toLocaleString()}</div>
            </div>
          ))}
          {items.length === 0 ? <p className="text-xs text-muted-foreground">No incidents logged yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
