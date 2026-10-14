import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { SupabaseRequestError, supabaseRest } from "../lib/supabase";

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
  } catch (error) {
    if (error instanceof SupabaseRequestError) {
      _req.log.warn(
        { status: error.status, code: error.code, latency: Date.now() - startedAt },
        "Supabase health probe failed",
      );
    } else {
      _req.log.warn(
        { errorName: error instanceof Error ? error.name : "UnknownError", latency: Date.now() - startedAt },
        "Supabase health probe failed",
      );
    }
    res.status(503).json({ supabase: "failed", latency: Date.now() - startedAt });
  }
});

export default router;
