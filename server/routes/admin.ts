import { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import sgMail from "@sendgrid/mail";
import { prisma } from "../prisma";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_FROM = process.env.SENDGRID_FROM || "";

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export const registerAdmin: RequestHandler = async (req, res) => {
  const { name, email, company, password } = req.body as {
    name: string;
    email: string;
    company?: string;
    password: string;
  };
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const exists = await prisma.admin.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (exists)
      return res.status(409).json({ error: "Email already registered" });
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomUUID();
    await prisma.admin.create({
      data: {
        name,
        email: email.toLowerCase(),
        company: company || null,
        passwordHash,
        verificationToken,
      },
    });

    const base = APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const verifyUrl = `${base}/api/admin/verify?token=${verificationToken}`;
    
    let sendgridError: any = null;
    if (SENDGRID_API_KEY && SENDGRID_FROM) {
      try {
        await sgMail.send({
          to: email,
          from: SENDGRID_FROM,
          subject: "Welcome to AstraHire AI – Verify your email",
          html: `<p>Hi ${name},</p><p>Thanks for registering. Please verify your email to activate your admin account.</p><p><a href="${verifyUrl}">Verify your email</a></p>`,
        });
      } catch (e: any) {
        // Capture and log SendGrid error but do not fail registration
        sendgridError = e?.response?.body || e?.message || String(e);
        try {
          console.error("SendGrid error while sending verification email:", sendgridError);
        } catch (logErr) {
          console.error("SendGrid error (and failed to stringify error):", e);
        }
      }
    }

    // Return verifyUrl and sendgridError so callers can verify manually if email sending failed
    res.status(201).json({ message: "Registered. Check your email to verify.", verifyUrl, sendgridError });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Registration failed" });
  }
};

export const verifyEmail: RequestHandler = async (req, res) => {
  const token = (req.query.token as string) || "";
  if (!token) return res.status(400).send("Missing token");
  try {
    const updated = await prisma.admin.updateMany({
      where: { verificationToken: token },
      data: { emailVerified: true, verificationToken: null },
    });
    if (updated.count === 0)
      return res.status(400).send("Invalid or used token");
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Verification failed");
  }
};

export const loginAdmin: RequestHandler = async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password)
    return res.status(400).json({ error: "Missing fields" });
  try {
    const user = await prisma.admin.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (!user.emailVerified)
      return res.status(403).json({ error: "Email not verified" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = signToken({ sub: user.id });
    res.cookie("auth", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 7 * 24 * 3600 * 1000,
    });
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      company: user.company,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Login failed" });
  }
};

export const me: RequestHandler = async (req, res) => {
  const token = req.cookies?.auth as string | undefined;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = await prisma.admin.findUnique({ where: { id: decoded.sub } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      company: user.company,
    });
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};
