import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Mic, MessageSquareText } from "lucide-react";

const schema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  context: z.string().min(3),
  interviewerRole: z.string().min(2),
  durationMinutes: z
    .number({ invalid_type_error: "Duration must be a number" })
    .int()
    .min(5, { message: "Minimum 5 minutes" })
    .max(180, { message: "Maximum 180 minutes" })
    .optional(),
  interactionMode: z.enum(["AUDIO", "TEXT_ONLY"]),
  maxAttempts: z
    .number({ invalid_type_error: "Max attempts must be a number" })
    .int()
    .min(1, { message: "Minimum 1 attempt" })
    .optional(),
});

export type InterviewInput = z.infer<typeof schema>;

export function AdminInterviewForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: Partial<InterviewInput>;
  onSubmit: (v: InterviewInput) => Promise<void>;
  submitting?: boolean;
}) {
  const form = useForm<InterviewInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title || "",
      description: initial?.description || "",
      context: initial?.context || "",
      interviewerRole: initial?.interviewerRole || "",
      durationMinutes: (initial as any)?.durationMinutes ?? undefined,
      interactionMode: (initial as any)?.interactionMode || "AUDIO",
      maxAttempts: (initial as any)?.maxAttempts ?? undefined,
    },
  });

  // Sync defaults when initial loads/changes
  useEffect(() => {
    if (initial) {
      form.reset({
        title: initial.title || "",
        description: initial.description || "",
        context: initial.context || "",
        interviewerRole: initial.interviewerRole || "",
        durationMinutes: (initial as any).durationMinutes ?? undefined,
        interactionMode: (initial as any).interactionMode || "AUDIO",
        maxAttempts: (initial as any).maxAttempts ?? undefined,
      });
    }
  }, [initial, form]);

  return (
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
        <label className="text-sm">Duration (minutes)</label>
        <input
          type="number"
          min={5}
          max={180}
          className="h-10 rounded-md border bg-background px-3"
          {...form.register("durationMinutes", {
            setValueAs: (v) =>
              v === "" || v === null || typeof v === "undefined"
                ? undefined
                : Number(v),
          })}
        />
        {form.formState.errors.durationMinutes && (
          <p className="text-xs text-destructive">
            {form.formState.errors.durationMinutes.message as string}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <label className="text-sm">Interaction Type</label>
        <RadioGroup
          className="grid grid-cols-2 gap-3"
          value={form.watch("interactionMode")}
          onValueChange={(v) =>
            form.setValue("interactionMode", v as any, { shouldDirty: true })
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
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
