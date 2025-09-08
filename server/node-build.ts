import path from "path";
import { createServer } from "./index";
import * as express from "express";

const app = createServer();
const port = process.env.PORT || 3000;

// In production, serve the built SPA files
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../spa");

// Serve static files
app.use(express.static(distPath));

// Handle React Router - serve index.html only for browser HTML GET requests
app.use((req, res, next) => {
  // Don't interfere with API or health endpoints
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) return next();
  // Only serve index for GET requests that accept HTML (avoid returning HTML for API JSON requests)
  if (req.method !== "GET") return next();
  const accepts = req.headers["accept"] || "";
  if (typeof accepts === "string" && accepts.indexOf("text/html") === -1) return next();
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) next(err);
  });
});

app.listen(port, () => {
  console.log(`🚀 Fusion Starter server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
