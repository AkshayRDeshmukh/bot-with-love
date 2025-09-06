import { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export interface AuthRequest extends Request {
  userId?: string;
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.cookies?.auth as string | undefined;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
    (req as AuthRequest).userId = decoded.sub;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};
