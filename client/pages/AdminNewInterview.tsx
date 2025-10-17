import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Mic, MessageSquareText } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Controller } from "react-hook-form";

const schema = z
  .object({
    title: z.string().min(3),
    description: z.string().min(10),
    context: z.string().min(3),
    interviewerRole: z.string().min(2),
    interactionMode: z.enum(["AUDIO", "TEXT_ONLY"]),
    speechProvider: z.enum(["BROWSER", "AZURE"]).optional(),
    recordingEnabled: z.boolean().optional(),
    linkStartAt: z.string().optional(),
    linkExpiryAt: z.string().optional(),
    maxAttempts: z
      .number({ invalid_type_error: "Max attempts must be a number" })
      .int()
      .min(1, { message: "Minimum 1 attempt" })
      .optional(),
  })
  .refine(
    (data) => {
      if (!data.linkStartAt || !data.linkExpiryAt) return true;
      const s = new Date(data.linkStartAt).getTime();
      const e = new Date(data.linkExpiryAt).getTime();
      if (isNaN(s) || isNaN(e)) return false;
      return e > s;
    },
    { message: "Expiry must be after start", path: ["linkExpiryAt"] },
  );

type FormValues = z.infer<typeof schema>;

export default function AdminNewInterview() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { interactionMode: "AUDIO", speechProvider: "BROWSER", maxAttempts: undefined, recordingEnabled: true },
  });


  const onSubmit = async (values: FormValues) => {
    setError(null);
    const res = await fetch("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error || "Failed to create interview";
      setError(msg);
      toast({ title: "Failed", description: msg, variant: "destructive" });
      return;
    }
    toast({
      title: "Interview created",
      description: "Your interview was saved.",
    });
    navigate("/admin", { replace: true });
  };

  return (
    <section className="bg-gradient-to-b from-background to-muted/40">
      <div className="container py-10 md:py-16">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            New Interview
          </h1>
          <p className="mt-2 text-muted-foreground">
            Define the interview details. Only you (the creator) will see and
            manage it.
          </p>
        </div>
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Interview Details</CardTitle>
            <CardDescription>
              These fields will be passed to the LLM prompt later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-2">
                <label className="text-sm">Title</label>
                <input
                  className="h-10 rounded-md border bg-background px-3"
                  {...form.register("title")}
                />
                {form.formState.errors.title && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.title.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <label className="text-sm">Description</label>
                <textarea
                  rows={4}
                  className="rounded-md border bg-background px-3 py-2"
                  {...form.register("description")}
                />
                {form.formState.errors.description && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.description.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <label className="text-sm">Context</label>
                <textarea
                  rows={3}
                  className="rounded-md border bg-background px-3 py-2"
                  {...form.register("context")}
                />
                {form.formState.errors.context && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.context.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <label className="text-sm">Interviewer Role</label>
                <input
                  className="h-10 rounded-md border bg-background px-3"
                  placeholder="e.g., Technical Expert, HR, Client Success Manager"
                  {...form.register("interviewerRole")}
                />
                {form.formState.errors.interviewerRole && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.interviewerRole.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <label className="text-sm">Interaction Type</label>
                <RadioGroup
                  className="grid grid-cols-2 gap-3"
                  value={form.watch("interactionMode")}
                  onValueChange={(v) =>
                    form.setValue("interactionMode", v as any, {
                      shouldDirty: true,
                    })
                  }
                >
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition hover:bg-accent ${form.watch("interactionMode") === "AUDIO" ? "ring-1 ring-primary" : ""}`}
                  >
                    <RadioGroupItem value="AUDIO" className="mt-0.5" />
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4" />
                      <div>
                        <div className="text-sm font-medium">Audio</div>
                        <div className="text-xs text-muted-foreground">
                          Voice input enabled
                        </div>
                      </div>
                    </div>
                  </label>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition hover:bg-accent ${form.watch("interactionMode") === "TEXT_ONLY" ? "ring-1 ring-primary" : ""}`}
                  >
                    <RadioGroupItem value="TEXT_ONLY" className="mt-0.5" />
                    <div className="flex items-center gap-2">
                      <MessageSquareText className="h-4 w-4" />
                      <div>
                        <div className="text-sm font-medium">Text only</div>
                        <div className="text-xs text-muted-foreground">
                          Microphone disabled
                        </div>
                      </div>
                    </div>
                  </label>
                </RadioGroup>
                {form.formState.errors.interactionMode && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.interactionMode.message as string}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <label className="text-sm">Speech Provider</label>
                <div className="text-xs text-muted-foreground">Choose how candidate audio is transcribed.</div>
                <RadioGroup
                  className="grid grid-cols-2 gap-3 mt-2"
                  value={form.watch("speechProvider")}
                  onValueChange={(v) => form.setValue("speechProvider", v as any, { shouldDirty: true })}
                >
                  <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition hover:bg-accent ${form.watch("speechProvider") === "BROWSER" ? "ring-1 ring-primary" : ""}`}>
                    <RadioGroupItem value="BROWSER" className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Browser (Web Speech API)</div>
                      <div className="text-xs text-muted-foreground">Uses the user's browser speech recognition (default)</div>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition hover:bg-accent ${form.watch("speechProvider") === "AZURE" ? "ring-1 ring-primary" : ""}`}>
                    <RadioGroupItem value="AZURE" className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Azure Speech Service</div>
                      <div className="text-xs text-muted-foreground">Send audio to Azure Speech for transcription</div>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              <div className="grid gap-2">
                <label className="text-sm">Screen Recording</label>
                <div className="flex items-center gap-3">
                  <Controller
                    control={form.control}
                    name="recordingEnabled"
                    render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={(v: any) => field.onChange(!!v)} />
                    )}
                  />
                  <div className="text-sm text-muted-foreground">Enable automatic screen recording for interviews (default: enabled)</div>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-sm">
                  Max Attempts (default for this interview)
                </label>
                <input
                  type="number"
                  min={1}
                  className="h-10 rounded-md border bg-background px-3"
                  {...form.register("maxAttempts", {
                    setValueAs: (v) =>
                      v === "" || v === null || typeof v === "undefined"
                        ? undefined
                        : Number(v),
                  })}
                />
                {form.formState.errors.maxAttempts && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.maxAttempts.message as string}
                  </p>
                )}
              </div>
              {error && (
                <div className="rounded-md border bg-card p-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button type="submit">Create Interview</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
