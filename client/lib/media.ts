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
