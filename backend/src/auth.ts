import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { Router, type RequestHandler, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma.js";
import { loginLimiter } from "./security.js";

export const authRouter = Router();
const cookieName = "radiohub_refresh";
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
};
const refreshDuration =
  Number(process.env.REFRESH_TOKEN_DAYS ?? 7) * 86_400_000;
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

function secret() {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET non configurato");
  return process.env.JWT_SECRET;
}

function sessionResponse(
  user: { id: string; email: string },
  sessionId: string,
) {
  return {
    token: jwt.sign({ sub: user.id, sid: sessionId }, secret(), {
      algorithm: "HS256",
      issuer: "radiohub",
      audience: "radiohub-web",
      expiresIn: Number(process.env.ACCESS_TOKEN_SECONDS ?? 900),
    }),
    user: { id: user.id, email: user.email },
  };
}

async function startSession(
  res: Response,
  user: { id: string; email: string },
) {
  const token = randomBytes(32).toString("hex");
  await prisma.refreshSession.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  const session = await prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + refreshDuration),
    },
  });
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: refreshDuration });
  return sessionResponse(user, session.id);
}

authRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

authRouter.post("/register", loginLimiter, async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 8 ||
    Buffer.byteLength(password) > 72
  ) {
    res.status(400).json({
      error:
        "Inserisci un'email valida e una password di almeno 8 caratteri e massimo 72 byte",
    });
    return;
  }
  try {
    secret();
    if (await prisma.user.findUnique({ where: { email } })) {
      res.status(409).json({ error: "Email già registrata" });
      return;
    }
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(password, 12) },
    });
    res.status(201).json(await startSession(res, user));
  } catch {
    res.status(500).json({ error: "Impossibile completare la registrazione" });
  }
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  try {
    secret();
    const user = await prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      Buffer.byteLength(password) > 72 ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      res.status(401).json({ error: "Email o password non corretti" });
      return;
    }
    res.json(await startSession(res, user));
  } catch {
    res.status(500).json({ error: "Impossibile completare l'accesso" });
  }
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.[cookieName];
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    res.status(401).json({ error: "Sessione scaduta, accedi di nuovo" });
    return;
  }
  secret();
  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!session || session.expiresAt <= new Date()) {
    res.status(401).json({ error: "Sessione scaduta, accedi di nuovo" });
    return;
  }
  const nextToken = randomBytes(32).toString("hex");
  // Un solo rinnovo può consumare il vecchio token, anche con richieste simultanee.
  const rotated = await prisma.refreshSession.updateMany({
    where: {
      id: session.id,
      tokenHash: hash(token),
      expiresAt: { gt: new Date() },
    },
    data: { tokenHash: hash(nextToken) },
  });
  if (!rotated.count) {
    res.status(401).json({ error: "Refresh token già utilizzato" });
    return;
  }
  res.cookie(cookieName, nextToken, {
    ...cookieOptions,
    maxAge: session.expiresAt.getTime() - Date.now(),
  });
  res.json(sessionResponse(session.user, session.id));
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.[cookieName];
  if (typeof token === "string")
    await prisma.refreshSession.deleteMany({
      where: { tokenHash: hash(token) },
    });
  res.clearCookie(cookieName, cookieOptions).status(204).end();
});

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
    const payload = jwt.verify(token ?? "", secret(), {
      algorithms: ["HS256"],
      issuer: "radiohub",
      audience: "radiohub-web",
    });
    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string"
    )
      throw new Error();
    const session = await prisma.refreshSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!session) throw new Error();
    res.locals.userId = payload.sub;
    res.set("Cache-Control", "no-store");
    next();
  } catch {
    res.status(401).json({ error: "Autenticazione richiesta" });
  }
};
