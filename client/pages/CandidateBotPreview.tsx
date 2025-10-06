import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Bot,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Send,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import InterviewRecorder from "@/components/InterviewRecorder";

function useTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function CandidateBotPreview(props?: {
  interviewId?: string;
  interview?: {
    title?: string;
    description?: string;
    context?: string;
    contextDomain?: string;
    interviewerRole?: string;
    durationMinutes?: number;
    interactionMode?: "AUDIO" | "TEXT_ONLY";
    speechProvider?: "BROWSER" | "AZURE";
  };
  candidateToken?: string;
  attemptsInfo?: { allowed?: number; used?: number };
}) {
  const time = useTimer();
  const [muted, setMuted] = useState(
    props?.interview?.interactionMode === "TEXT_ONLY" ? true : false,
  );
  const [videoOn, setVideoOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Camera stream
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [proctorPromptOpen, setProctorPromptOpen] = useState(true);
  const [proctorUploading, setProctorUploading] = useState(false);

  // Proctoring: enabled toggle, status, baseline hash and interval
  const [proctoringEnabled, setProctoringEnabled] = useState(false);
  const [proctorStatus, setProctorStatus] = useState<string | null>(null);
  const baselineRef = useRef<number[] | null>(null);
  const proctorIntervalRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const loadingDetectorRef = useRef(false);

  // Draggable/resizable self-view
  const dragRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const [size, setSize] = useState({ w: 320, h: 200 });
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const start = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // --- Proctoring helpers (component scope) ---
  function computeGrayscaleHashFromCanvas(c: HTMLCanvasElement) {
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const w = c.width;
    const h = c.height;
    const image = ctx.getImageData(0, 0, w, h).data;
    const out: number[] = [];
    for (let i = 0; i < image.length; i += 4) {
      const r = image[i];
      const g = image[i + 1];
      const b = image[i + 2];
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      out.push(lum);
    }
    return out;
  }

  function meanAbsDiff(a: number[] | null, b: number[] | null) {
    if (!a || !b || a.length !== b.length) return 1;
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    return sum / a.length;
  }

  async function ensureDetector() {
    if (detectorRef.current) return detectorRef.current;
    if ((window as any).FaceDetector) {
      try {
        detectorRef.current = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 4 });
        return detectorRef.current;
      } catch (e) {
        // fallthrough
      }
    }
    if (loadingDetectorRef.current) return null;
    loadingDetectorRef.current = true;
    try {
      if (!(window as any).tf) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.20.0/dist/tf.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load tfjs"));
          document.head.appendChild(s);
        });
      }
      if (!(window as any).blazeface) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/dist/blazeface.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load blazeface"));
          document.head.appendChild(s);
        });
      }
      const model = await (window as any).blazeface.load();
      detectorRef.current = { type: "blazeface", model };
      return detectorRef.current;
    } catch (e) {
      console.warn("Proctor: failed to load detector", e);
      return null;
    } finally {
      loadingDetectorRef.current = false;
    }
  }

  async function detectFacesOnVideo(video: HTMLVideoElement) {
    const det = await ensureDetector();
    if (!det) return [];
    if ((window as any).FaceDetector && det instanceof (window as any).FaceDetector) {
      try {
        const faces = await det.detect(video as any);
        return faces.map((f: any) => ({ box: f.boundingBox }));
      } catch (e) {
        return [];
      }
    }
    if (det && det.type === "blazeface") {
      try {
        const preds = await det.model.estimateFaces(video, false);
        return preds.map((p: any) => ({ box: { x: p.topLeft[0], y: p.topLeft[1], width: p.bottomRight[0] - p.topLeft[0], height: p.bottomRight[1] - p.topLeft[1] } }));
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  function captureFaceHashFromBox(video: HTMLVideoElement, box: { x: number; y: number; width: number; height: number } | null) {
    const tmp = document.createElement("canvas");
    const targetW = 32;
    const targetH = 32;
    tmp.width = targetW;
    tmp.height = targetH;
    const ctx = tmp.getContext("2d");
    if (!ctx) return null;
    try {
      if (box && box.width > 0 && box.height > 0) {
        ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, targetW, targetH);
      } else {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const s = Math.min(vw, vh) * 0.6;
        const sx = (vw - s) / 2;
        const sy = (vh - s) / 2;
        ctx.drawImage(video, sx, sy, s, s, 0, 0, targetW, targetH);
      }
      return computeGrayscaleHashFromCanvas(tmp);
    } catch (e) {
      return null;
    }
  }

  async function runProctorCheckOnce() {
    try {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) return;
      const faces = await detectFacesOnVideo(video);
      if (!faces || faces.length === 0) {
        setProctorStatus("no_face");
        return;
      }
      if (faces.length > 1) {
        setProctorStatus("multiple_persons");
        return;
      }
      const box = faces[0].box;
      const hash = captureFaceHashFromBox(video, { x: box.x, y: box.y, width: box.width, height: box.height });
      if (!hash) return;
      if (!baselineRef.current) {
        baselineRef.current = hash;
        setProctorStatus("baseline_captured");
        return;
      }
      const diff = meanAbsDiff(baselineRef.current, hash);
      if (diff > 0.25) {
        setProctorStatus("face_mismatch");
      } else {
        setProctorStatus("ok");
      }
    } catch (e) {
      console.warn("Proctor check failed", e);
    }
  }

  async function startProctoring() {
    if (proctorIntervalRef.current) return;
    // ensure detector is ready before starting
    const det = await ensureDetector();
    if (!det) {
      setProctorStatus("detector_failed");
      return;
    }
    // reset baseline so first successful detection set baseline
    baselineRef.current = null;
    setProctorStatus("starting");

    const scheduleNext = () => {
      const delay = 2000 + Math.floor(Math.random() * 3000); // 2000..4999 ms
      const id = window.setTimeout(async () => {
        await runProctorCheckOnce();
        scheduleNext();
      }, delay);
      proctorIntervalRef.current = id as any;
    };

    // run immediately then schedule randomized checks
    await runProctorCheckOnce();
    scheduleNext();
  }

  function stopProctoring() {
    if (proctorIntervalRef.current) {
      try {
        window.clearTimeout(proctorIntervalRef.current as any);
      } catch {}
      proctorIntervalRef.current = null;
    }
    setProctorStatus(null);
    baselineRef.current = null;
  }

  useEffect(() => {
    const textOnly = props?.interview?.interactionMode === "TEXT_ONLY";
    // Start camera and (optionally) mic
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: textOnly
            ? false
            : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
        } as any);
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e: any) {
        setMediaError(e?.message || "Camera access denied");
        setProctorPromptOpen(false);
      }
    })();

    // Keep self-view small by default
    setSize({ w: 320, h: 200 });

    function onMove(e: MouseEvent) {
      if (isDragging.current) {
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        setPos((p) => ({ x: Math.max(8, p.x + dx), y: Math.max(8, p.y + dy) }));
        start.current.x = e.clientX;
        start.current.y = e.clientY;
      } else if (isResizing.current) {
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        setSize({
          w: Math.max(200, start.current.w + dx),
          h: Math.max(200, start.current.h + dy),
        });
      }
    }

    function onUp() {
      isDragging.current = false;
      isResizing.current = false;
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      // cleanup proctoring interval and detector
      if (proctorIntervalRef.current) {
        try {
          window.clearTimeout(proctorIntervalRef.current as any);
        } catch {}
        proctorIntervalRef.current = null;
      }
      detectorRef.current = null;
    };
  }, [props?.interview?.interactionMode]);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  useEffect(() => {
    botSpeakingRef.current = botSpeaking;
  }, [botSpeaking]);

  const pauseTranscription = () => {
    try {
      // Mark that we paused due to bot playback
      transcriptionPausedByBotRef.current = true;
      // Stop Web Speech recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    } catch {}
    try {
      // Stop Azure recognizer
      if (azureRecognizerRef.current && typeof azureRecognizerRef.current.stopContinuousRecognitionAsync === "function") {
        try {
          azureRecognizerRef.current.stopContinuousRecognitionAsync(() => {}, () => {});
        } catch {}
      }
    } catch {}
    try {
      // Stop media recorder to avoid sending chunks (stop clears any buffered dataavailable)
      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.state === "recording" || mediaRecorderRef.current.state === "paused") {
            mediaRecorderRef.current.stop();
          }
        } catch {}
        mediaRecorderRef.current = null;
      }
    } catch {}
  };

  const startMediaRecorderFromStream = () => {
    try {
      const stream = streamRef.current;
      if (!stream) return;
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = async (ev: BlobEvent) => {
        try {
          // do not transcribe during bot playback
          if (botSpeakingRef.current) return;
          const blob = ev.data;
          if (!blob || blob.size === 0) return;
          const fd = new FormData();
          fd.append("audio", blob, "chunk.webm");
          const r = await fetch("/api/azure/transcribe", { method: "POST", body: fd });
          if (!r.ok) return;
          const j = await r.json();
          const txt = (j && (j.text || j?.text?.DisplayText)) || "";
          if (txt && txt.trim()) {
            // Buffer recognized text for explicit send instead of auto-posting
            pendingTranscriptRef.current = pendingTranscriptRef.current
              ? `${pendingTranscriptRef.current} ${String(txt).trim()}`.trim()
              : String(txt).trim();
            setInterim("");
            setInput((cur) => (cur && cur.trim() ? cur : pendingTranscriptRef.current));
          }
        } catch (e) {
          console.warn("Azure transcribe failed", e);
        }
      };
      mr.onerror = (e) => console.warn("MediaRecorder error", e);
      mr.start(3000);
    } catch (e) {
      console.warn("Failed to start media recorder from stream", e);
    }
  };

  const resumeTranscription = () => {
    if (muted) return; // don't resume if mic muted
    // only resume if we paused due to bot playback
    if (!transcriptionPausedByBotRef.current) return;
    transcriptionPausedByBotRef.current = false;
    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {}
      }
    } catch {}
    try {
      if (azureRecognizerRef.current && typeof azureRecognizerRef.current.startContinuousRecognitionAsync === "function") {
        try {
          azureRecognizerRef.current.startContinuousRecognitionAsync();
        } catch {}
      }
    } catch {}
    try {
      // If mediaRecorder was stopped earlier, restart from existing stream
      if (!mediaRecorderRef.current && props?.interview?.speechProvider === "AZURE") {
        startMediaRecorderFromStream();
      }
    } catch (e) {
      console.warn("Failed to resume media recorder", e);
    }
  };

  const cancelSpeak = () => {
    try {
      synthRef.current?.cancel();
    } catch {}
    setBotSpeaking(false);
    // ensure transcription is resumed after cancelling bot speak
    try {
      resumeTranscription();
    } catch {}
  };

  const speakBot = (text: string) => {
    if (!text) return;
    cancelSpeak();
    setInput("");
    setInterim("");
    if (props?.interview?.interactionMode === "TEXT_ONLY") {
      return;
    }
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.volume = 1;
    utter.onstart = () => {
      // pause transcription immediately when bot starts speaking
      try {
        pauseTranscription();
      } catch {}
      setBotSpeaking(true);
    };
    utter.onend = () => {
      setBotSpeaking(false);
      try {
        resumeTranscription();
      } catch {}
    };
    utter.onerror = () => {
      setBotSpeaking(false);
      try {
        resumeTranscription();
      } catch {}
    };
    utterRef.current = utter;
    // ensure transcription paused before we speak
    try {
      pauseTranscription();
    } catch {}
    synthRef.current?.speak(utter);
  };

  const botAvatar = useMemo(
    () => (
      <div className="relative h-full w-full overflow-hidden rounded-xl bg-neutral-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative h-32 w-32">
            <div className="absolute inset-0 animate-pulse rounded-full bg-violet-500/20" />
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500" />
            <Bot className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-white opacity-90" />
          </div>
        </div>
      </div>
    ),
    [],
  );

  type ChatMessage = { from: "bot" | "me"; text: string; t: string };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const [interim, setInterim] = useState("");
  const pendingFinalRef = useRef<string>("");
  // buffered finalized text waiting for explicit user send
  const pendingTranscriptRef = useRef<string>("");
  const silenceTimerRef = useRef<number | null>(null);
  const recentFinalizedAtRef = useRef<number>(0);
  const lastEventAtRef = useRef<number>(Date.now());
  const recStartAtRef = useRef<number>(0);
  const botSpeakingRef = useRef<boolean>(false);
  // flag to indicate transcription was paused due to bot playback
  const transcriptionPausedByBotRef = useRef<boolean>(false);
  const SILENCE_MS = 350;
  const [search] = useSearchParams();
  // Prefer explicit prop, fallback to URL search param
  const interviewId = props?.interviewId || search.get("id") || undefined;
  const attemptId = useMemo(() => {
    if (props?.candidateToken) return `attempt_${props.candidateToken}_${Date.now()}`;
    return `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }, [props?.candidateToken]);
  const [interviewCtx, setInterviewCtx] = useState<{
    title?: string;
    description?: string;
    context?: string;
    interviewerRole?: string;
    durationMinutes?: number;
    interactionMode?: string | null;
    speechProvider?: string | null;
    recordingEnabled?: boolean;
  } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(Date.now());
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);

  // Auto-start proctoring when interview starts (no user toggle)
  useEffect(() => {
    if (!startedAt) return;
    // start proctoring once
    (async () => {
      if (!proctoringEnabled) setProctoringEnabled(true);
      await startProctoring();
    })();
    return () => {
      stopProctoring();
      setProctoringEnabled(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (props?.interview) {
          setInterviewCtx({ ...props.interview });
          return;
        }
        if (interviewId) {
          const res = await fetch(`/api/interviews/${interviewId}`, {
            credentials: "include",
          });
          if (res.ok) {
            const data = await res.json();
            if (active) {
              setInterviewCtx({
                title: data?.title,
                description: data?.description,
                context: data?.contextSummary ?? data?.context,
                contextDomain: data?.contextDomain || undefined,
                interviewerRole: data?.interviewerRole,
                durationMinutes:
                  typeof data?.durationMinutes === "number"
                    ? data.durationMinutes
                    : undefined,
                interactionMode: data?.interactionMode,
                speechProvider: data?.speechProvider,
                recordingEnabled: typeof data?.recordingEnabled === "boolean" ? data.recordingEnabled : true,
              });
            }
          }
        }
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [interviewId, props?.interview]);

  useEffect(() => {
    if (!startedAt) return;
    const mins = interviewCtx?.durationMinutes;
    if (!mins || !Number.isFinite(mins) || mins <= 0) return;
    const totalMs = mins * 60 * 1000;
    const tick = () => {
      const now = Date.now();
      const rem = Math.max(0, Math.floor((startedAt + totalMs - now) / 1000));
      setRemainingSec(rem);
      if (rem <= 0) setEnded(true);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [startedAt, interviewCtx?.durationMinutes]);

  // Enforce text-only mode by keeping mic muted and cancel any ongoing TTS
  useEffect(() => {
    if (props?.interview?.interactionMode === "TEXT_ONLY") {
      setMuted(true);
      cancelSpeak();
    }
  }, [props?.interview?.interactionMode]);

  async function askLLM(userText: string): Promise<string> {
    try {
      const history = messages.map((m) => ({
        role: m.from === "me" ? "user" : "assistant",
        content: m.text,
      }));
      const res = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId,
          token: props?.candidateToken || undefined,
          userText,
          history,
          interview: interviewCtx || undefined,
          timing: {
            remainingSeconds:
              typeof remainingSec === "number" ? remainingSec : undefined,
            totalMinutes: interviewCtx?.durationMinutes,
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { reply?: string };
      return (data.reply || "").trim() || generateBotReply(userText);
    } catch {
      return generateBotReply(userText);
    }
  }

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    const el = chatBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Simple local bot reply generator
  function generateBotReply(userText: string): string {
    const lower = userText.toLowerCase();
    if (lower.includes("hello") || lower.includes("hi"))
      return "Hi! Can you walk me through a recent project?";
    if (lower.includes("experience"))
      return "What was your most impactful contribution?";
    if (lower.includes("react"))
      return "How do you handle state and performance in complex React apps?";
    if (lower.includes("team"))
      return "Describe a time you collaborated to resolve a tough issue.";
    return "Got it. Could you elaborate a bit more?";
  }

  function nowHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function addMessage(from: "bot" | "me", text: string) {
    setMessages((prev) => [...prev, { from, text, t: nowHHMM() }]);
  }

  function handleSend() {
    if (ended) return;
    // Combine any buffered finalized transcript with current input/interim
    const buffered = pendingTranscriptRef.current.trim();
    const typed = (interim || input).trim();
    let text = "";
    if (buffered && typed) {
      text = buffered === typed ? buffered : `${buffered} ${typed}`.trim();
    } else {
      text = (buffered || typed).trim();
    }
    if (!text) return;
    // clear buffers
    pendingTranscriptRef.current = "";
    pendingFinalRef.current = "";
    setInterim("");
    addMessage("me", text);
    setInput("");
    if (!startedAt) setStartedAt(Date.now());
    (async () => {
      const reply = await askLLM(text);
      addMessage("bot", reply);
      speakBot(reply);
    })();
  }

  // Speech-to-text using Web Speech API
  const recognitionRef = useRef<any>(null);
  const inputAreaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    // If interview is configured to use Azure Speech, skip browser SpeechRecognition
    const useAzure = props?.interview?.speechProvider === "AZURE";
    if (useAzure) return; // Azure handled by MediaRecorder flow below

    const SpeechRecognition: any =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recog = new SpeechRecognition();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = "en-US";
    recognitionRef.current = recog;

    recog.onaudiostart = () => {
      lastEventAtRef.current = Date.now();
    };
    recog.onstart = () => {
      lastEventAtRef.current = Date.now();
      recStartAtRef.current = Date.now();
    };
    recog.onsoundstart = () => {
      lastEventAtRef.current = Date.now();
    };
    recog.onspeechstart = () => {
      lastEventAtRef.current = Date.now();
    };

    const finalizeIfNeeded = () => {
      // do not process finalization while bot is speaking
      if (botSpeakingRef.current) return;
      const pending = pendingFinalRef.current.trim();
      const interimNow = interim.trim();
      const finalText = `${pending} ${interimNow}`.trim();
      if (finalText) {
        // Buffer finalized text for explicit user send instead of auto-posting
        pendingTranscriptRef.current = pendingTranscriptRef.current
          ? `${pendingTranscriptRef.current} ${finalText}`.trim()
          : finalText;
        pendingFinalRef.current = "";
        setInterim("");
        // If user hasn't typed anything manually, show buffered text in input
        setInput((cur) => (cur && cur.trim() ? cur : pendingTranscriptRef.current));
        recentFinalizedAtRef.current = Date.now();
      }
    };

    recog.onresult = (event: any) => {
      // do not process recognition results while bot is speaking
      if (botSpeakingRef.current) return;
      // reset silence timer on any result
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result[0];
        const transcript = String(alt?.transcript || "");
        if (result.isFinal) {
          const text = transcript.trim();
          if (text) {
            pendingFinalRef.current = pendingFinalRef.current
              ? `${pendingFinalRef.current} ${text}`
              : text;
          }
        } else {
          interimText += transcript;
        }
      }
      interimText = interimText.trim();
      if (interimText && interimText.length >= 1) {
        setInterim(interimText);
        setInput(interimText);
      }
      lastEventAtRef.current = Date.now();
      // start silence timer
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = window.setTimeout(() => {
        finalizeIfNeeded();
      }, SILENCE_MS) as unknown as number;
    };

    recog.onnomatch = () => {
      lastEventAtRef.current = Date.now();
    };
    recog.onerror = () => {
      if (!muted) {
        try {
          recog.stop();
        } catch {}
        setTimeout(() => {
          try {
            recog.start();
          } catch {}
        }, 150);
      }
    };
    recog.onend = () => {
      // do not finalize or restart recognition while bot is speaking
      if (botSpeakingRef.current) return;
      // finalize any pending final text into the buffer (do not auto-send)
      if (Date.now() - recentFinalizedAtRef.current > 250) {
        const pending = pendingFinalRef.current.trim();
        if (pending) {
          pendingFinalRef.current = "";
          pendingTranscriptRef.current = pendingTranscriptRef.current
            ? `${pendingTranscriptRef.current} ${pending}`.trim()
            : pending;
          setInterim("");
          setInput((cur) => (cur && cur.trim() ? cur : pendingTranscriptRef.current));
        }
      }
      if (!muted) {
        try {
          recog.start();
        } catch {}
      }
    };

    if (!muted) {
      try {
        recog.start();
      } catch {}
    }

    const watchdog = window.setInterval(() => {
      const now = Date.now();
      const idle = now - lastEventAtRef.current;
      if (!muted && idle > 8000) {
        try {
          recog.stop();
        } catch {}
        setTimeout(() => {
          try {
            recog.start();
          } catch {}
        }, 80);
      }
      const run = now - recStartAtRef.current;
      if (!muted && run > 50000) {
        try {
          recog.stop();
        } catch {}
        setTimeout(() => {
          try {
            recog.start();
          } catch {}
        }, 120);
      }
    }, 5000);

    return () => {
      try {
        recog.onresult = null;
        recog.onend = null;
        recog.stop();
      } catch {}
      if (watchdog) window.clearInterval(watchdog);
    };
  }, [muted]);

  // Azure Speech: attempt browser SDK first, fallback to sending chunks to server
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const azureRecognizerRef = useRef<any>(null);
  useEffect(() => {
    const useAzure = props?.interview?.speechProvider === "AZURE";
    if (!useAzure) return;
    let stream: MediaStream | null = null;
    let usingSdk = false;

    const startMediaRecorderFallback = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false } as any);
      } catch (e) {
        console.warn("Unable to access microphone for Azure speech", e);
        return;
      }
      if (!stream) return;
      try {
        const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
        mediaRecorderRef.current = mr;

        mr.ondataavailable = async (ev: BlobEvent) => {
          try {
            // do not transcribe during bot playback
            if (botSpeakingRef.current) return;
            const blob = ev.data;
            if (!blob || blob.size === 0) return;
            const fd = new FormData();
            fd.append("audio", blob, "chunk.webm");
            const r = await fetch("/api/azure/transcribe", { method: "POST", body: fd });
            if (!r.ok) return;
            const j = await r.json();
            const txt = (j && (j.text || j?.text?.DisplayText)) || "";
            if (txt && txt.trim()) {
              // Buffer recognized text for explicit send instead of auto-posting
              pendingTranscriptRef.current = pendingTranscriptRef.current
                ? `${pendingTranscriptRef.current} ${String(txt).trim()}`.trim()
                : String(txt).trim();
              setInterim("");
              setInput((cur) => (cur && cur.trim() ? cur : pendingTranscriptRef.current));
            }
          } catch (e) {
            console.warn("Azure transcribe failed", e);
          }
        };

        mr.onerror = (e) => console.warn("MediaRecorder error", e);
        mr.start(3000); // emit dataavailable every 3s
      } catch (e) {
        console.warn("MediaRecorder unsupported or failed", e);
      }
    };

    const startAzureSdk = async () => {
      try {
        // get credentials (region + key or token)
        const t = await fetch(`/api/azure/token`);
        if (!t.ok) throw new Error(`token fetch failed: ${t.status}`);
        const creds = await t.json();
        const azureApiKey = creds.apiKey || creds.key || creds.subscriptionKey;
        const azureRegion = creds.region;
        if (!azureApiKey || !azureRegion) throw new Error("Azure token missing fields");

        // load sdk if not present
        if (typeof window !== "undefined" && !(window as any).SpeechSDK) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://aka.ms/csspeech/jsbrowserpackageraw";
            script.onload = () => resolve();
            script.onerror = (e) => reject(new Error("Failed to load Speech SDK"));
            document.head.appendChild(script);
          });
        }

        const SpeechSDK = (window as any).SpeechSDK;
        if (!SpeechSDK) throw new Error("SpeechSDK unavailable after load");

        // create config using subscription (server-provided key). For production use token exchange
        const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(azureApiKey, azureRegion);
        speechConfig.speechRecognitionLanguage = "en-US";
        try {
          speechConfig.outputFormat = SpeechSDK.OutputFormat.Detailed;
        } catch {}

        const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

        recognizer.recognizing = (s: any, e: any) => {
          const interimText = e.result && e.result.text ? String(e.result.text) : "";
          try {
            if (!botSpeakingRef.current) {
              setInterim(interimText);
              setInput(interimText);
            }
          } catch {}
          // console.log(`🎤 Azure recognizing: ${interimText}`);
        };

        recognizer.recognized = (s: any, e: any) => {
          try {
            if (botSpeakingRef.current) return;
            if (e.result && e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
              const recognizedText = String(e.result.text || "").trim();
              if (recognizedText) {
                // Buffer recognized text for explicit send
                pendingTranscriptRef.current = pendingTranscriptRef.current
                  ? `${pendingTranscriptRef.current} ${recognizedText}`.trim()
                  : recognizedText;
                setInterim("");
                setInput((cur) => (cur && cur.trim() ? cur : pendingTranscriptRef.current));
              }
            }
          } catch (err) {
            console.warn("azure recognized handler error", err);
          }
        };

        recognizer.sessionStopped = (_s: any, _e: any) => {
          try {
            recognizer.stopContinuousRecognitionAsync();
          } catch {}
        };
        recognizer.canceled = (_s: any, e: any) => {
          console.warn("Azure recognition canceled", e && e.reason);
          try {
            recognizer.stopContinuousRecognitionAsync();
          } catch {}
        };

        azureRecognizerRef.current = recognizer;
        recognizer.startContinuousRecognitionAsync();
        usingSdk = true;
        console.log("Azure SDK recognition started");
      } catch (e) {
        console.warn("Azure SDK init failed, falling back to media recorder:", e);
        usingSdk = false;
      }
    };

    const init = async () => {
      // try SDK first
      await startAzureSdk();
      if (!usingSdk && !muted) {
        await startMediaRecorderFallback();
      }
    };

    if (!muted) init();

    return () => {
      try {
        if (azureRecognizerRef.current) {
          try {
            azureRecognizerRef.current.stopContinuousRecognitionAsync();
          } catch {}
          azureRecognizerRef.current = null;
        }
      } catch {}
      try {
        mediaRecorderRef.current?.stop();
      } catch {}
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      mediaRecorderRef.current = null;
    };
  }, [muted, props?.interview?.speechProvider]);

  useEffect(() => {
    const el = inputAreaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [interim]);

  useEffect(() => {
    if (!ended) return;
    try {
      recognitionRef.current?.stop();
    } catch {}
    try {
      streamRef.current?.getTracks().forEach((t) => (t.enabled = false));
    } catch {}
    setMuted(true);
    if (props?.candidateToken) {
      const history = messages.map((m) => ({
        role: m.from === "me" ? "user" : "assistant",
        content: m.text,
      }));
      fetch("/api/candidate/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: props.candidateToken, history }),
      }).catch(() => {});
      fetch("/api/candidate/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: props.candidateToken,
          status: "COMPLETED",
        }),
      }).catch(() => {});
    }
  }, [ended]);

  async function captureAndUploadProctorPhoto() {
    if (!props?.candidateToken) return;
    try {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) {
        toast({
          title: "Camera not ready",
          description: "Please wait a moment and try again.",
        });
        return;
      }
      const w = Math.min(640, video.videoWidth);
      const h = Math.round((video.videoHeight / video.videoWidth) * w);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      setProctorUploading(true);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
      );
      if (!blob) {
        setProctorUploading(false);
        toast({ title: "Capture failed", variant: "destructive" });
        return;
      }
      const fd = new FormData();
      fd.append("photo", blob, "proctor.jpg");
      const res = await fetch(
        `/api/candidate/upload-proctor-photo?token=${encodeURIComponent(props.candidateToken)}`,
        { method: "POST", body: fd },
      );
      setProctorUploading(false);
      if (!res.ok) {
        toast({
          title: "Upload failed",
          description: await res.text(),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Photo captured",
        description: "Proctoring photo saved.",
      });
      setProctorPromptOpen(false);
    } catch (e: any) {
      setProctorUploading(false);
      toast({
        title: "Capture error",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <section className="relative min-h-[calc(100vh-64px)] bg-muted/30 flex flex-col">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.18),transparent_40%),radial-gradient(ellipse_at_bottom_right,rgba(79,70,229,0.18),transparent_40%)]" />
      {/* Top bar */}
      <div className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-12 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span className="text-sm font-medium">AI Interview Simulation</span>
            <span className="text-xs text-muted-foreground">Connected</span>
          </div>
          <div className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
            {typeof props?.attemptsInfo?.allowed === "number" && (
              <span className="rounded bg-black/20 px-2 py-0.5 mr-2">
                Attempt{" "}
                {Math.min(
                  (props?.attemptsInfo?.used || 0) + 1,
                  props?.attemptsInfo?.allowed,
                )}{" "}
                of {props?.attemptsInfo?.allowed}
              </span>
            )}
            <span>{time}</span>
            {typeof remainingSec === "number" && (
              <span className="rounded bg-black/20 px-2 py-0.5">{`${String(Math.floor(remainingSec / 60)).padStart(2, "0")}:${String(remainingSec % 60).padStart(2, "0")}`}</span>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container flex-1 pt-4">
        <Card className="overflow-hidden h-full flex flex-col">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={chatOpen ? 70 : 100} minSize={40}>
              <div className="relative h-full bg-black">
                {/* Bot main feed */}
                <div
                  className={`absolute inset-0 ${botSpeaking ? "ring-4 ring-sky-500/70" : ""} transition-shadow`}
                >
                  {botAvatar}
                </div>

                {/* Self view */}
                <div
                  ref={dragRef}
                  className="absolute cursor-grab rounded-lg border border-white/20 bg-neutral-800 shadow-lg"
                  style={{
                    right: pos.x,
                    bottom: pos.y,
                    width: size.w,
                    height: size.h,
                  }}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).dataset.resize === "1")
                      return;
                    isDragging.current = true;
                    start.current.x = e.clientX;
                    start.current.y = e.clientY;
                    document.body.style.userSelect = "none";
                  }}
                >
                  <div className="relative h-full w-full overflow-hidden rounded-xl ring-1 ring-white/20 backdrop-blur bg-white/5">
                    {mediaError ? (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-red-200 bg-neutral-900">
                        {mediaError}
                      </div>
                    ) : (
                      <>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="h-full w-full object-cover"
                        />

                        {/* Proctor status overlay */}
                        {proctoringEnabled && proctorStatus && (
                          <div className="absolute left-2 top-2 z-20 space-y-1">
                            {proctorStatus === "ok" && (
                              <div className="inline-flex items-center rounded-full bg-emerald-600/90 px-2 py-1 text-xs text-white">Proctor: OK</div>
                            )}
                            {proctorStatus === "starting" && (
                              <div className="inline-flex items-center rounded-full bg-sky-600/90 px-2 py-1 text-xs text-white">Proctor: starting</div>
                            )}
                            {proctorStatus === "baseline_captured" && (
                              <div className="inline-flex items-center rounded-full bg-sky-600/90 px-2 py-1 text-xs text-white">Baseline captured</div>
                            )}
                            {proctorStatus === "no_face" && (
                              <div className="inline-flex items-center rounded-full bg-red-600/90 px-2 py-1 text-xs text-white">No face detected</div>
                            )}
                            {proctorStatus === "multiple_persons" && (
                              <div className="inline-flex items-center rounded-full bg-amber-500/90 px-2 py-1 text-xs text-white">Multiple persons</div>
                            )}
                            {proctorStatus === "face_mismatch" && (
                              <div className="inline-flex items-center rounded-full bg-red-600/90 px-2 py-1 text-xs text-white">Face mismatch</div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {/* Resize handle */}
                    <div
                      data-resize="1"
                      onMouseDown={(e) => {
                        isResizing.current = true;
                        start.current = {
                          x: e.clientX,
                          y: e.clientY,
                          w: size.w,
                          h: size.h,
                        } as any;
                        document.body.style.userSelect = "none";
                      }}
                      className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm bg-white/60"
                    />
                  </div>
                </div>
                {/* Bottom controls inside video */}
                <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center">
                  <div className="flex items-center gap-3 rounded-full bg-black/60 px-3 py-2 shadow-lg backdrop-blur">
                    <button
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${muted ? "bg-red-500 text-white" : "bg-white/90 text-black"} ${props?.interview?.interactionMode === "TEXT_ONLY" ? "opacity-60 cursor-not-allowed" : ""}`}
                      onClick={() => {
                        if (props?.interview?.interactionMode === "TEXT_ONLY") {
                          toast({
                            title: "Text-only interview",
                            description:
                              "You're only allowed to use text interaction for this interview.",
                          });
                          return;
                        }
                        setMuted((v) => {
                          const next = !v;
                          const tracks =
                            streamRef.current?.getAudioTracks() || [];
                          tracks.forEach((t) => (t.enabled = !next));
                          try {
                            if (next) recognitionRef.current?.stop();
                            else recognitionRef.current?.start();
                          } catch {}
                          return next;
                        });
                      }}
                      aria-label={muted ? "Unmute" : "Mute"}
                    >
                      {muted ? (
                        <MicOff className="h-5 w-5" />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${videoOn ? "bg-white/90 text-black" : "bg-red-500 text-white"}`}
                      onClick={() => {
                        setVideoOn((v) => {
                          const next = !v;
                          const tracks =
                            streamRef.current?.getVideoTracks() || [];
                          tracks.forEach((t) => (t.enabled = next));
                          return next;
                        });
                      }}
                      aria-label={videoOn ? "Turn video off" : "Turn video on"}
                    >
                      {videoOn ? (
                        <Video className="h-5 w-5" />
                      ) : (
                        <VideoOff className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white"
                      aria-label="End call"
                      onClick={() => setEnded(true)}
                    >
                      <PhoneOff className="h-5 w-5" />
                    </button>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-full bg-red-600/90 px-3 text-sm text-white"
                      onClick={() => setEnded(true)}
                    >
                      End Interview
                    </button>
                    {/* Proctoring starts automatically once interview begins; no user toggle provided. */}
                    <button
                      className="ml-2 inline-flex h-10 items-center gap-2 rounded-full bg-white/90 px-3 text-sm text-black"
                      onClick={() => setChatOpen((v) => !v)}
                    >
                      <MessageSquare className="h-4 w-4" /> Chat{" "}
                      {chatOpen ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronLeft className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              defaultSize={chatOpen ? 30 : 0}
              minSize={0}
              collapsible
            >
              <div className="flex min-h-0 h-[70vh] flex-col bg-background">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div className="text-sm font-medium">Transcript</div>
                  <div className="text-xs text-muted-foreground">
                    Preview only
                  </div>
                </div>
                <div
                  ref={chatBodyRef}
                  className="min-h-0 flex-1 overflow-y-auto space-y-2 p-3"
                >
                  {messages.length === 0 ? (
                    <div className="text-center text-xs text-muted-foreground">
                      Say something or type to start the conversation.
                    </div>
                  ) : (
                    messages.map((m, i) =>
                      m.from === "bot" ? (
                        <div
                          key={i}
                          className="flex max-w-[90%] items-start gap-3"
                        >
                          <div className="h-8 w-8 animate-glow rounded-full bg-gradient-to-br from-violet-500 to-indigo-500" />
                          <div className="max-w-[80%] rounded-2xl bg-card p-3 text-sm shadow">
                            <div>{m.text}</div>
                            <div className="mt-1 text-[10px] opacity-70">
                              {m.t}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={i}
                          className="ml-auto flex max-w-[90%] items-start justify-end gap-3"
                        >
                          <div className="ml-auto max-w-[80%] rounded-2xl bg-primary p-3 text-sm text-primary-foreground shadow">
                            <div>{m.text}</div>
                            <div className="mt-1 text-[10px] opacity-70">
                              {m.t}
                            </div>
                          </div>
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500" />
                        </div>
                      ),
                    )
                  )}
                </div>
                <div className="border-t p-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                  >
                    <div className="flex items-end gap-2">
                      <textarea
                        ref={inputAreaRef}
                        rows={2}
                        value={botSpeaking ? "" : interim || input}
                        onChange={(e) => setInput(e.target.value)}
                        onInput={(e) => {
                          const el = e.currentTarget;
                          el.scrollTop = el.scrollHeight;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        className="min-h-16 max-h-40 w-full flex-1 rounded-md border bg-background px-3 py-2 text-sm resize-y"
                        placeholder={
                          botSpeaking
                            ? "Bot is speaking…"
                            : interim
                              ? "Listening…"
                              : "Type a message and press Enter"
                        }
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="shrink-0"
                        aria-label="Send"
                        disabled={ended || botSpeaking || (!interim && !input)}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </Card>
      </div>
      {proctorPromptOpen && props?.candidateToken && !mediaError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-xl">
            <h2 className="text-lg font-semibold">Proctoring Photo</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We will capture a single photo from your live video now for
              proctoring. Please look at the camera and ensure your face is well
              lit.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button
                onClick={() => setProctorPromptOpen(false)}
                variant="secondary"
              >
                Not now
              </Button>
              <Button
                onClick={captureAndUploadProctorPhoto}
                disabled={proctorUploading}
              >
                {proctorUploading ? "Capturing…" : "Capture now"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {ended && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/95 backdrop-blur">
          <div className="mx-4 w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-green-500/15 flex items-center justify-center">
              <Bot className="h-7 w-7 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold">Thank you for your time!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The interview has concluded. We will review your responses and
              share your results over email soon.
            </p>
            <div className="mt-5 flex justify-center">
              <a
                href="/"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow hover:opacity-90"
              >
                Back to Home
              </a>
            </div>
          </div>
        </div>
      )}
      {interviewCtx?.recordingEnabled && !ended && (
        <InterviewRecorder attemptId={attemptId} interviewId={interviewId} enabled={true} />
      )}
    </section>
  );
}
