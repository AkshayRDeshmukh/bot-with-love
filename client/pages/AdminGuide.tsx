import React, { useState } from "react";
import AdminGuideFlow from "@/components/InterviewBotUI/AdminGuideFlow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminGuide() {
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-gradient-to-b from-background to-muted/40">
      <div className="container py-10 md:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Admin Guides & Tools</h1>
          <p className="mt-3 text-muted-foreground">Step-by-step instructions and live component previews for admins.</p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Admin — User Guide</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Open the admin guide to learn how to create interviews, generate report templates, add candidates, share links, and view reports.</p>
              <div className="mt-4">
                <Button onClick={() => setOpen(true)}>Open Admin Guide</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick links</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Button onClick={() => (window.location.href = '/admin')}>Admin Dashboard</Button>
                <Button variant="secondary" onClick={() => (window.location.href = '/admin/interviews/new')}>Create Interview</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {open && <AdminGuideFlow open={open} onClose={() => setOpen(false)} />}
      </div>
    </section>
  );
}
