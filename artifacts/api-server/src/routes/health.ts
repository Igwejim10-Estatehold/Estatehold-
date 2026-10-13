import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { supabaseRest } from "../lib/supabase";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health/supabase", async (_req, res): Promise<void> => {
  const startedAt = Date.now();
  try {
    await supabaseRest<unknown>("properties?select=id&limit=1");
    res.json({ supabase: "connected", latency: Date.now() - startedAt });
  } catch {
    res.status(503).json({ supabase: "failed", latency: Date.now() - startedAt });
  }
});

export default router;
