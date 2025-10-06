import { RequestHandler } from "express";
import multer from "multer";
import { getBlobServiceClient, getContainerName } from "../azure";
import { prisma } from "../prisma";

const upload = multer({ storage: multer.memoryStorage() });

export const uploadInterviewChunk: RequestHandler[] = [
  upload.single("chunk"),
  async (req, res) => {
    try {
      const file = (req as any).file;
      let { attemptId, seq, ts, interviewId } = (req as any).body || {};
      if (!file) return res.status(400).json({ error: "No chunk file provided" });
      if (!attemptId) return res.status(400).json({ error: "attemptId required" });

      // If interviewId wasn't provided, try to derive it from attemptId pattern 'attempt_<inviteToken>_...'
      if (!interviewId && typeof attemptId === 'string') {
        const m = String(attemptId).match(/^attempt_([0-9a-fA-F-]{36})_/);
        if (m) {
          try {
            const ic = await prisma.interviewCandidate.findFirst({ where: { inviteToken: m[1] } });
            if (ic) interviewId = ic.interviewId;
          } catch (e) {
            // ignore lookup errors
          }
        }
      }

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

      // Persist metadata to database and include result in response
      let savedRecord: any = null;
      try {
        savedRecord = await prisma.interviewRecording.create({
          data: {
            interviewId: interviewId || null,
            attemptId,
            blobName,
            url,
            seq: seq ? Number(seq) : undefined,
          },
        });
      } catch (e) {
        console.warn("Failed to persist recording metadata", e);
      }

      return res.json({ ok: true, url, blobName, saved: Boolean(savedRecord), recordingId: savedRecord?.id || null });
    } catch (e: any) {
      console.error("uploadInterviewChunk error", e);
      return res.status(500).json({ error: e?.message || "upload failed" });
    }
  },
];
