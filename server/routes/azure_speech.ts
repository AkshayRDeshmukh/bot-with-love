import { RequestHandler } from "express";
import multer from "multer";

const upload = multer();

export const transcribeAzure: RequestHandler = async (req, res) => {
  try {
    const apiKey = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (!apiKey || !region) return res.status(500).json({ error: "Azure speech credentials not configured" });

    // multer places file in req.file
    await new Promise<void>((resolve, reject) => {
      upload.single("audio")(req as any, res as any, (err: any) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const file = (req as any).file;
    if (!file || !file.buffer) return res.status(400).json({ error: "No audio provided" });

    // Azure Speech-to-Text REST API (short audio)
    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "Content-Type": file.mimetype || "audio/webm",
        Accept: "application/json",
      },
      body: file.buffer,
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error("Azure STT error:", r.status, txt);
      return res.status(502).json({ error: "Azure transcription failed", detail: txt });
    }

    const data = await r.json();
    // Azure returns { RecognitionStatus: 'Success', DisplayText: '...' } or alternative shape
    const text = data?.DisplayText || data?.displayText || (data?.NBest && data.NBest[0]?.Display) || "";
    res.json({ text });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Transcription failed" });
  }
};
