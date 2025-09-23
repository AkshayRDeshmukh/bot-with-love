import React, { useState } from "react";
import UserGuideFlow from "@/components/InterviewBotUI/UserGuideFlow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function UI() {
  const [openGuide, setOpenGuide] = useState(false);

  return (
    <section className="bg-gradient-to-b from-background to-muted/40">
      <div className="container py-10 md:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">UI Playground & Guides</h1>
          <p className="mt-3 text-muted-foreground">Hands-on user guide and interactive preview for the candidate interview experience.</p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Interview Bot — User Guide</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Click the button below to open a step-by-step user guide that explains the candidate flow, permissions, and interview controls.</p>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => setOpenGuide(true)}>Open User Guide</Button>
                <Link to="/candidate/preview"><Button variant="secondary">Open Candidate Preview</Button></Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Other resources</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Access documentation, privacy policy, or contact support for help with your interview.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {openGuide && <UserGuideFlow open={openGuide} onClose={() => setOpenGuide(false)} />}
    </section>
  );
}
