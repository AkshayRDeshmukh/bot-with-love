import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  ChartBar,
  FileText,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

export default function Index() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.18),transparent_40%),radial-gradient(ellipse_at_bottom_right,rgba(79,70,229,0.18),transparent_40%)]" />
        <div className="container grid gap-10 py-16 md:grid-cols-2 md:gap-12 md:py-24">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Meet your hiring
              copilot
            </div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Your Interview Assistant, with a human touch
            </h1>
            <p className="max-w-prose text-muted-foreground">
              Engage candidates in friendly, consistent conversations and get
              clear, easy-to-read summaries that help you decide with
              confidence. Simple to use, fast to set up, and designed for great
              candidate experience.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-gradient-to-r from-violet-500 to-indigo-500"
              >
                <a href="/admin/auth">Start as Admin</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="/candidate">Join as Candidate</a>
              </Button>
            </div>
            <div className="flex items-center gap-3 pt-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>Secure, role-based access • Docker-ready • API-first</span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-violet-400/30 to-indigo-400/30 blur-2xl" />
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 shadow-xl ring-1 ring-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-5 w-5 text-primary" /> Live Interview
                  Preview
                </CardTitle>
                <CardDescription>
                  Conversational UI with animated avatar and smooth transitions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex max-w-[80%] items-start gap-3">
                    <div className="h-8 w-8 animate-glow rounded-full bg-gradient-to-br from-violet-500 to-indigo-500" />
                    <div className="rounded-2xl bg-card p-3 shadow">
                      <p className="text-sm">
                        Welcome! I\'m your AI interviewer. Tell me about a time
                        you navigated ambiguity.
                      </p>
                    </div>
                  </div>
                  <div className="ml-auto max-w-[80%] rounded-2xl bg-primary p-3 text-primary-foreground shadow">
                    <p className="text-sm">
                      I led a cross-functional effort where requirements evolved
                      weekly, focusing on rapid feedback loops.
                    </p>
                  </div>
                  <div className="flex max-w-[80%] items-start gap-3">
                    <div className="h-8 w-8 animate-glow rounded-full bg-gradient-to-br from-violet-500 to-indigo-500" />
                    <div className="rounded-2xl bg-card p-3 shadow">
                      <p className="text-sm">
                        Excellent. How did you quantify success and what
                        trade-offs did you make?
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/30 py-14">
        <div className="container grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Consistent conversations
              </CardTitle>
              <CardDescription>
                Every candidate gets the same fair, friendly experience
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actionable summaries</CardTitle>
              <CardDescription>
                Clear write-ups you can share with your team
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Faster decisions</CardTitle>
              <CardDescription>
                Less time scheduling, more time hiring
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      <section className="py-14">
        <div className="container">
          <div className="mt-2 flex flex-col items-center justify-center gap-4 text-center">
            <h3 className="text-2xl font-semibold">
              Ready to meet your next great hire?
            </h3>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <a href="/admin">Launch Admin Console</a>
              </Button>
              <Button asChild variant="outline">
                <a href="/candidate">Try Candidate Flow</a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
