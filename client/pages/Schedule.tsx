import React, { useMemo } from "react";
import InterviewRecorder from "../components/InterviewRecorder";
import { useSearchParams } from "react-router-dom";

export default function SchedulePage() {
  const [searchParams] = useSearchParams();
  const attemptIdParam = searchParams.get("attemptId");

  const attemptId = useMemo(() => {
    if (attemptIdParam) return attemptIdParam;
    // generate attempt id: interview_attempt_ + timestamp + random
    return `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }, [attemptIdParam]);

  return (
    <div style={{ padding: 20 }}>
      <h2>Schedule / Interview (Recording Enabled)</h2>
      <p>Recording is enabled by default on this page. Chunks will upload automatically to Azure Blob Storage under:</p>
      <pre style={{ background: "#f5f5f5", padding: 8 }}>{`<container>/${attemptId}/...`}</pre>

      <InterviewRecorder attemptId={attemptId} enabled={true} />
    </div>
  );
}
