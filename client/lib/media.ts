// Utilities to register and stop media streams created by the app
// Keep a simple global registry so we can stop all app-created streams when needed

export function registerAppMediaStream(s: MediaStream | null) {
  if (!s) return;
  try {
    const win = window as any;
    if (!win.__APP_MEDIA_STREAMS__) win.__APP_MEDIA_STREAMS__ = [];
    if (!win.__APP_MEDIA_STREAMS__.includes(s)) win.__APP_MEDIA_STREAMS__.push(s);
  } catch {}
}

export function unregisterAppMediaStream(s: MediaStream | null) {
  if (!s) return;
  try {
    const win = window as any;
    if (!win.__APP_MEDIA_STREAMS__) return;
    win.__APP_MEDIA_STREAMS__ = win.__APP_MEDIA_STREAMS__.filter((x: any) => x !== s);
  } catch {}
}

export function stopAllAppMediaStreams() {
  try {
    const win = window as any;
    const arr: MediaStream[] = Array.isArray(win.__APP_MEDIA_STREAMS__) ? win.__APP_MEDIA_STREAMS__.slice() : [];
    for (const s of arr) {
      try {
        if (s && s.getTracks) {
          s.getTracks().forEach((t: MediaStreamTrack) => {
            try {
              t.stop();
            } catch {}
          });
        }
      } catch {}
    }
    win.__APP_MEDIA_STREAMS__ = [];
  } catch {}
}

// Safe helpers that work across browsers/contexts
export async function getUserMediaSafe(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (typeof navigator === "undefined") throw new Error("Navigator unavailable");
  const md: any = (navigator as any).mediaDevices;
  if (md && typeof md.getUserMedia === "function") {
    return md.getUserMedia(constraints as any);
  }
  const legacy = (navigator as any).getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia || (navigator as any).msGetUserMedia;
  if (legacy) {
    return new Promise<MediaStream>((resolve, reject) => legacy.call(navigator, constraints, resolve, reject));
  }
  const reasons: string[] = [];
  try {
    if (!(window as any).isSecureContext) reasons.push("requires HTTPS or localhost");
    if (window.top !== window) reasons.push("not allowed in embedded iframe without camera/microphone permissions");
  } catch {}
  const extra = reasons.length ? `: ${reasons.join("; ")}` : "";
  throw new Error(`Media devices unavailable${extra}`);
}

export async function getDisplayMediaSafe(constraints: DisplayMediaStreamOptions): Promise<MediaStream> {
  if (typeof navigator === "undefined") throw new Error("Navigator unavailable");
  const md: any = (navigator as any).mediaDevices;
  if (md && typeof md.getDisplayMedia === "function") {
    return md.getDisplayMedia(constraints as any);
  }
  const legacy = (navigator as any).getDisplayMedia;
  if (legacy) {
    return legacy.call(navigator, constraints);
  }
  throw new Error("Screen capture not supported in this browser or context");
}
