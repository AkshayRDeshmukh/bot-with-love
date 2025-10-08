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

      const source = (req as any).body?.source || null;
      try {
        console.info("Received chunk upload", { attemptId, interviewId, seq, ts, source });
      } catch {}
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
      } catch (e: any) {
        console.error("Failed to persist recording metadata", {
          attemptId,
          interviewId,
          blobName,
          url,
          error: e?.message || String(e),
          stack: e?.stack,
        });
      }

      const resBody: any = { ok: true, url, blobName, saved: Boolean(savedRecord), recordingId: savedRecord?.id || null };
      // Include a brief error message in non-production for easier debugging
      if (!savedRecord && process.env.NODE_ENV !== "production") {
        resBody.savedError = "Failed to persist recording metadata; check server logs for details.";
      }
      return res.json(resBody);
    } catch (e: any) {
      console.error("uploadInterviewChunk error", e);
      return res.status(500).json({ error: e?.message || "upload failed" });
    }
  },
];
