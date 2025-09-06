import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ReportParameter = {
  id: string;
  name: string;
  description?: string;
  weight: number; // 0..100
  scale: { type: "1-5" | "percentage" | "stars"; min: number; max: number };
};

export type ReportStructure = {
  parameters: ReportParameter[];
  includeOverall: boolean;
  includeSkillLevels: boolean;
};

export function ReportTemplateEditor({ interviewId }: { interviewId: string }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [structure, setStructure] = useState<ReportStructure | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingParam, setEditingParam] = useState<ReportParameter | null>(
    null,
  );

  const load = async () => {
    if (!interviewId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/interviews/${interviewId}/report-template`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load template");
      const data = await res.json();
      setStructure(data.structure);
    } catch (e) {
      setError("Failed to load template");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [interviewId]);

  const sumWeights = useMemo(
    () =>
      (structure?.parameters || []).reduce(
        (a, p) => a + (Number(p.weight) || 0),
        0,
      ),
    [structure],
  );

  const addParamAndEdit = () => {
    const id = crypto.randomUUID();
    const param: ReportParameter = {
      id,
      name: "New Parameter",
      description: "",
      weight: 10,
      scale: { type: "1-5", min: 1, max: 5 },
    };
    setStructure((prev) => {
      const base: ReportStructure = prev || {
        parameters: [],
        includeOverall: true,
        includeSkillLevels: true,
      };
      return { ...base, parameters: [...base.parameters, param] };
    });
    setEditingParam(param);
    setEditOpen(true);
  };

  const removeParam = (id: string) => {
    setStructure((prev) =>
      prev
        ? { ...prev, parameters: prev.parameters.filter((p) => p.id !== id) }
        : prev,
    );
  };

  const updateParam = (id: string, patch: Partial<ReportParameter>) => {
    setStructure((prev) =>
      prev
        ? {
            ...prev,
            parameters: prev.parameters.map((p) =>
              p.id === id ? { ...p, ...patch } : p,
            ),
          }
        : prev,
    );
  };

  const generate = async () => {
    if (!interviewId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/interviews/${interviewId}/report-template/generate`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to generate");
      const data = await res.json();
      setStructure(data.structure);
    } catch (e) {
      setError("Failed to generate template");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!structure) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/interviews/${interviewId}/report-template`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ structure }),
        },
      );
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setStructure(data.structure);
    } catch (e) {
      setError("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>AI Report Template</CardTitle>
          <CardDescription>
            Auto-generate and edit evaluation parameters
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={generate}
            disabled={loading}
            className="bg-white text-foreground shadow-sm hover:shadow ring-1 ring-border"
          >
            <Sparkles className="h-4 w-4 mr-1.5 text-primary" />
            Generate with AI
          </Button>
          <Button onClick={save} disabled={saving || !structure}>
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <div className="mb-3 text-sm text-destructive">{error}</div>}
        {!structure ? (
          <div className="text-sm text-muted-foreground">
            {loading
              ? "Loading..."
              : "No template yet. Click Generate with AI."}
          </div>
        ) : (
          <div className="space-y-3">
            {/* header row */}
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" /> Overall
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-secondary" /> Skill
                  Levels
                </span>
              </div>
              <div
                className={`text-xs ${sumWeights !== 100 ? "text-amber-600" : "text-muted-foreground"}`}
              >
                Total weight: {sumWeights}%{" "}
                {sumWeights !== 100 && "(should be 100%)"}
              </div>
            </div>

            {/* parameters list */}
            <div className="grid gap-2">
              {structure.parameters.map((p, idx) => (
                <div
                  key={p.id}
                  className={`grid grid-cols-12 items-start rounded-lg border p-3 sm:p-3 cursor-pointer hover:bg-accent/40 ${idx % 2 === 0 ? "bg-muted/50" : "bg-background"}`}
                  onClick={() => {
                    setEditingParam(p);
                    setEditOpen(true);
                  }}
                >
                  {/* Left: name + description */}
                  <div className="col-span-12 sm:col-span-8">
                    <div className="font-medium leading-tight">{p.name}</div>
                    {p.description ? (
                      <div className="text-xs text-muted-foreground mt-1">
                        {p.description}
                      </div>
                    ) : null}
                  </div>
                  {/* Right: weight + scale */}
                  <div className="col-span-12 sm:col-span-4 sm:text-right mt-2 sm:mt-0">
                    <div className="flex sm:justify-end gap-2 flex-wrap">
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-primary/10 text-primary border-primary/20">
                        Weight: {p.weight}%
                      </span>
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-secondary/10 text-foreground border-secondary/20">
                        Scale: {p.scale.type} ({p.scale.min}–{p.scale.max})
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add new parameter */}
            <div>
              <Button variant="secondary" onClick={addParamAndEdit}>
                Add Parameter
              </Button>
            </div>
          </div>
        )}

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Parameter</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={editingParam?.name || ""}
                  onChange={(e) =>
                    editingParam &&
                    setEditingParam({ ...editingParam, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={editingParam?.description || ""}
                  onChange={(e) =>
                    editingParam &&
                    setEditingParam({
                      ...editingParam,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Weight %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editingParam?.weight ?? 0}
                    onChange={(e) =>
                      editingParam &&
                      setEditingParam({
                        ...editingParam,
                        weight: Math.max(
                          0,
                          Math.min(100, Number(e.target.value) || 0),
                        ),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Scale</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={editingParam?.scale.type || "1-5"}
                    onChange={(e) =>
                      editingParam &&
                      setEditingParam({
                        ...editingParam,
                        scale: {
                          ...editingParam.scale,
                          type: e.target.value as any,
                        },
                      })
                    }
                  >
                    <option value="1-5">1–5</option>
                    <option value="percentage">Percentage</option>
                    <option value="stars">Stars</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => {
                  if (editingParam) removeParam(editingParam.id);
                  setEditOpen(false);
                }}
              >
                Remove
              </Button>
              <Button
                onClick={() => {
                  if (editingParam) updateParam(editingParam.id, editingParam);
                  setEditOpen(false);
                }}
              >
                Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
