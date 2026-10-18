import type { Request, RequestHandler, Response } from "express";
import { supabaseAuthUser, supabaseRest } from "./supabase";

export type EstateholdUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: EstateholdUser;
      rawBody?: Buffer;
    }
  }
}

async function getRequestUser(
  authorization: string | undefined,
): Promise<EstateholdUser | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;
  return supabaseAuthUser<EstateholdUser>(token);
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const user = await getRequestUser(req.get("authorization"));
    if (!user) {
      res.status(401).json({ message: "Sign in to continue." });
      return;
    }
    req.authUser = user;
    next();
  } catch (error) {
    req.log.warn({ error }, "Supabase token verification failed");
    res.status(503).json({ message: "Account verification is temporarily unavailable." });
  }
};

export async function requireUser(req: Request, res: Response) {
  if (!req.authUser) {
    res.status(401).json({ message: "Sign in to continue." });
    return null;
  }
  return req.authUser;
}

export async function getUserRole(userId: string): Promise<string> {
  const params = new URLSearchParams({
    select: "role,is_executive,is_admin",
    id: `eq.${userId}`,
    limit: "1",
  });
  try {
    const rows = await supabaseRest<Array<{ role?: string; is_executive?: boolean; is_admin?: boolean }>>(`profiles?${params}`);
    if (rows[0]?.is_executive === true) return "executive";
    if (rows[0]?.is_admin === true) return "admin";
    return rows[0]?.role ?? "client";
  } catch {
    // Older Supabase schemas may not have the explicit role flags yet.
    const legacyParams = new URLSearchParams({ select: "role", id: `eq.${userId}`, limit: "1" });
    const rows = await supabaseRest<Array<{ role?: string }>>(`profiles?${legacyParams}`);
    return rows[0]?.role ?? "client";
  }
}

export async function requireRoles(
  req: Request,
  res: Response,
  roles: string[],
): Promise<boolean> {
  const user = await requireUser(req, res);
  if (!user) return false;
  const role = await getUserRole(user.id);
  const executiveHasAdminAccess = role === "executive" && roles.includes("admin");
  if (!roles.includes(role) && !executiveHasAdminAccess) {
    res.status(403).json({ message: "Your account does not have access to this action." });
    return false;
  }
  return true;
}

export async function optionalUser(req: Request): Promise<EstateholdUser | null> {
  try {
    return await getRequestUser(req.get("authorization"));
  } catch {
    return null;
  }
}