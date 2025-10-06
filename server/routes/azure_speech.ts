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

    console.log(`Azure transcribe called — file: name=${file.originalname} size=${file.size} bytes mime=${file.mimetype}`);

    // Azure Speech-to-Text REST API (short audio)
    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        // preserve the incoming mimetype where possible
        "Content-Type": file.mimetype || "audio/webm",
        Accept: "application/json",
      },
      body: file.buffer,
    });

    const rawText = await r.text();
    let data: any = null;

    if (!r.ok) {
      console.error("Azure STT error status:", r.status, rawText);
      return res.status(502).json({ error: "Azure transcription failed", detail: rawText });
    }

    try {
      data = JSON.parse(rawText);
    } catch (err) {
      // not JSON — return raw body for debugging
      console.warn("Azure STT returned non-JSON response", rawText ? rawText.slice(0, 1000) : rawText);
      return res.json({ text: String(rawText || "").trim() });
    }

    console.log("Azure STT response:", JSON.stringify(data).slice(0, 2000));

    // Attempt various common paths for recognized text
    const text =
      data?.DisplayText ||
      data?.displayText ||
      (data?.NBest && data.NBest[0] && (data.NBest[0].Display || data.NBest[0].display)) ||
      (Array.isArray(data?.Recognition) && data.Recognition[0]?.DisplayText) ||
      (data?.recognized && data.recognized[0]?.text) ||
      "";

    // If azure says Success but no text, include full object in response for debugging
    if (!text && (data?.RecognitionStatus === "Success" || data?.RecognitionStatus === "Success")) {
      console.warn("Azure returned success but no DisplayText", data);
    }

    res.json({ text: text || "" , raw: data });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Transcription failed" });
  }
};
