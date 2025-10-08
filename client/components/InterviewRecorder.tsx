import React, { useEffect, useRef, useState } from "react";

type Props = {
  attemptId: string;
  interviewId?: string;
  enabled?: boolean;
};

// Simple upload queue with concurrency=1 and retry
function useUploadQueue(attemptId?: string, interviewId?: string) {
  const queueRef = useRef<Array<{ blob: Blob; seq: number; ts: number; source?: string }>>([]);
  const runningRef = useRef(false);

  const push = (item: { blob: Blob; seq: number; ts: number; source?: string }) => {
    queueRef.current.push(item);
    if (!runningRef.current) run(attemptId, interviewId);
  };

  const run = async (attemptId?: string, interviewId?: string) => {
    runningRef.current = true;
    while (queueRef.current.length) {
      const item = queueRef.current.shift()!;
      await uploadWithRetry(item.blob, item.seq, item.ts, attemptId, interviewId, item.source);
    }
    runningRef.current = false;
  };

  const uploadWithRetry = async (blob: Blob, seq: number, ts: number, attemptId?: string, interviewId?: string, source?: string) => {
    const maxAttempts = 5;
    let attempt = 0;
    let backoff = 500;
    while (attempt < maxAttempts) {
      try {
        const fd = new FormData();
        fd.append("chunk", blob, `chunk-${seq}.webm`);
        fd.append("seq", String(seq));
        fd.append("ts", String(ts));
        const aId = attemptId || (window as any).__INTERVIEW_ATTEMPT_ID__;
        if (!aId) throw new Error("Missing attemptId for upload");
        fd.append("attemptId", aId);
        if (interviewId) fd.append("interviewId", interviewId);
        if (source) fd.append("source", source);
        // telemetry/logging for easier debugging which component produced this chunk
        try {
          console.debug("Uploading chunk", { attemptId: aId, interviewId, seq, ts, source });
        } catch {}
        const res = await fetch("/api/record/chunk", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json().catch(() => ({}));
        return data;
      } catch (e) {
        attempt++;
        try { console.warn("Chunk upload attempt failed", { attempt, seq, source, err: e }); } catch {}
        await new Promise((r) => setTimeout(r, backoff));
        backoff *= 1.8;
      }
    }
    console.error("Failed to upload chunk after retries, dropping chunk seq=", seq, "source=", source);
  };

  return { push };
}

export default function InterviewRecorder({ attemptId, interviewId, enabled = true, muted = false }: Props & { muted?: boolean }) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const seqRef = useRef<number>(0);
  const uploadQueue = useUploadQueue(attemptId, interviewId);
  const [recording, setRecording] = useState<boolean>(false);

  useEffect(() => {
    // expose attemptId globally for upload queue helper
    (window as any).__INTERVIEW_ATTEMPT_ID__ = attemptId;
  }, [attemptId]);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const start = async () => {
      try {
        // get display (screen) stream
        const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: true,
          audio: true,
        });
        // get mic stream too
        let micStream: MediaStream | null = null;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (e) {
          // mic might be denied or not available
          micStream = null;
        }

        // combine tracks: prefer display audio + mic audio if available
        const combined = new MediaStream();
        displayStream.getVideoTracks().forEach((t) => combined.addTrack(t));
        displayStream.getAudioTracks().forEach((t) => combined.addTrack(t));
        if (micStream && !muted) micStream.getAudioTracks().forEach((t) => combined.addTrack(t));

        combinedStreamRef.current = combined;
        try { const m = await import("@/lib/media"); m.registerAppMediaStream(displayStream); } catch {}
        try { const m = await import("@/lib/media"); m.registerAppMediaStream(micStream); } catch {}
        try { const m = await import("@/lib/media"); m.registerAppMediaStream(combined); } catch {}

        // create MediaRecorder for chunks ~17000ms
        const options: any = { mimeType: "video/webm; codecs=vp8,opus" };
        const mr = new MediaRecorder(combined, options);
        mediaRecorderRef.current = mr;

        mr.ondataavailable = (ev: BlobEvent) => {
          const blob = ev.data;
          if (!blob || blob.size === 0) return;
          const seq = ++seqRef.current;
          const ts = Date.now();
          // push into upload queue (annotate source for telemetry)
          uploadQueue.push({ blob, seq, ts, source: "InterviewRecorder" });
        };

        mr.onerror = (e) => console.warn("MediaRecorder error", e);
        mr.onstart = () => setRecording(true);
        mr.onstop = () => setRecording(false);

        // start with 17s slices
        mr.start(17000);

        // handle tracks end to stop recorder
        const stopAll = () => {
          try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
          } catch {}
          try {
            combined.getTracks().forEach((t) => t.stop());
          } catch {}
        };

        // cleanup when either stream ends
        combined.getTracks().forEach((t) => t.addEventListener("ended", stopAll));
      } catch (e) {
        console.error("InterviewRecorder start failed", e);
      }
    };

    if (mounted) start();

    return () => {
      mounted = false;
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
      } catch {}
      try {
        combinedStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
    };
  }, [enabled, muted]);

  return (
    <div>
      <div>Recording: {recording ? "ON" : "OFF"}</div>
      <div style={{ fontSize: 12, color: "#666" }}>
        Attempt: {attemptId} — chunks uploading in background
      </div>
    </div>
  );
}
