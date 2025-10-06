import { RequestHandler } from "express";
import multer from "multer";
import { getBlobServiceClient, getContainerName } from "../azure";

const upload = multer({ storage: multer.memoryStorage() });

export const uploadInterviewChunk: RequestHandler[] = [
  upload.single("chunk"),
  async (req, res) => {
    try {
      const file = (req as any).file;
      const { attemptId, seq, ts } = (req as any).body || {};
      if (!file) return res.status(400).json({ error: "No chunk file provided" });
      if (!attemptId) return res.status(400).json({ error: "attemptId required" });

      const blobService = getBlobServiceClient();
      const containerName = getContainerName();
      const containerClient = blobService.getContainerClient(containerName);

      // ensure container exists
      try {
        await containerClient.createIfNotExists();
      } catch (e) {
        // ignore
      }

      const now = new Date(Number(ts) || Date.now());
      const pad = (n: number) => String(n).padStart(2, "0");
      const y = now.getFullYear();
      const m = pad(now.getMonth() + 1);
      const d = pad(now.getDate());
      const hh = pad(now.getHours());
      const mm = pad(now.getMinutes());
      const ss = pad(now.getSeconds());
      const timestamp = `${y}${m}${d}_${hh}${mm}${ss}`;

      const sequence = seq ? String(seq).padStart(5, "0") : String(Date.now());
      const blobName = `${attemptId}/${timestamp}/chunk-${sequence}.webm`;

      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype || "application/octet-stream" },
      });

      const url = blockBlobClient.url;

      return res.json({ ok: true, url, blobName });
    } catch (e: any) {
      console.error("uploadInterviewChunk error", e);
      return res.status(500).json({ error: e?.message || "upload failed" });
    }
  },
];
