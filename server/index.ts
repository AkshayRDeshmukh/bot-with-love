import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { handleDemo } from "./routes/demo";
import { loginAdmin, me, registerAdmin, verifyEmail } from "./routes/admin";
import { requireAuth } from "./middleware/auth";
import {
  createInterview,
  getInterview,
  listInterviews,
  updateInterview,
  deleteInterview,
} from "./routes/interviews";
import {
  listCandidates,
  createCandidate,
  downloadResume,
  inviteCandidate,
  inviteBulk,
  updateCandidateProfile,
} from "./routes/candidates";
import { chatWithLLM } from "./routes/llm";
import { downloadProctorPhoto } from "./routes/candidates";
import {
  getReportTemplate,
  generateReportTemplate,
  saveReportTemplate,
  getOrGenerateCandidateReport,
} from "./routes/reports";
import {
  getCandidateSession,
  uploadCandidateResume,
  saveTranscript,
  updateCandidateStatus,
  uploadProctorPhoto,
} from "./routes/candidate_public";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Public candidate routes (invite flow)
  app.get("/api/candidate/session", getCandidateSession);
  app.post("/api/candidate/upload-resume", ...(uploadCandidateResume as any));
  app.post("/api/candidate/transcript", saveTranscript);
  app.post("/api/candidate/status", updateCandidateStatus);
  app.post(
    "/api/candidate/upload-proctor-photo",
    ...(uploadProctorPhoto as any),
  );

  // LLM chat (preview + app usage)
  app.post("/api/llm/chat", chatWithLLM);

  // Admin auth routes
  app.post("/api/admin/register", registerAdmin);
  app.get("/api/admin/verify", verifyEmail);
  app.post("/api/admin/login", loginAdmin);
  app.get("/api/admin/me", me);

  // Interview routes (owner scoped)
  app.post("/api/interviews", requireAuth, createInterview);
  app.get("/api/interviews", requireAuth, listInterviews);
  app.get("/api/interviews/:id", requireAuth, getInterview);
  app.put("/api/interviews/:id", requireAuth, updateInterview);
  app.post("/api/interviews/:id/recompute-context", requireAuth, recomputeContextForInterview);
  app.delete("/api/interviews/:id", requireAuth, deleteInterview);

  // Admin backfill endpoint
  app.post("/api/admin/backfill-context-domain", requireAuth, backfillContextDomain);

  // Report templates
  app.get(
    "/api/interviews/:id/report-template",
    requireAuth,
    getReportTemplate,
  );
  app.post(
    "/api/interviews/:id/report-template/generate",
    requireAuth,
    generateReportTemplate,
  );
  app.put(
    "/api/interviews/:id/report-template",
    requireAuth,
    saveReportTemplate,
  );

  // Candidates for an interview
  app.get("/api/interviews/:id/candidates", requireAuth, listCandidates);
  app.post("/api/interviews/:id/candidates", requireAuth, ...createCandidate);
  app.post(
    "/api/interviews/:id/candidates/invite-bulk",
    requireAuth,
    inviteBulk,
  );
  app.post(
    "/api/interviews/:id/candidates/:cid/invite",
    requireAuth,
    inviteCandidate,
  );
  app.get(
    "/api/interviews/:id/candidates/:cid/resume",
    requireAuth,
    downloadResume,
  );
  app.get(
    "/api/interviews/:id/candidates/:cid/report",
    requireAuth,
    getOrGenerateCandidateReport,
  );
  app.get(
    "/api/interviews/:id/candidates/:cid/proctor-photo",
    requireAuth,
    downloadProctorPhoto,
  );
  app.put(
    "/api/interviews/:id/candidates/:cid/profile",
    requireAuth,
    updateCandidateProfile as any,
  );

  return app;
}
