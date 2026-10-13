import express, { type Express, type Request } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { SupabaseRequestError } from "./lib/supabase";

const app: Express = express();

logger.info({
  supabaseUrlSet: Boolean(process.env["SUPABASE_URL"]?.trim()),
  supabaseAnonKeySet: Boolean(process.env["SUPABASE_ANON_KEY"]?.trim()),
  supabaseServiceRoleKeySet: Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim()),
  databaseUrlSet: Boolean(process.env["DATABASE_URL"]?.trim()),
}, "Supabase environment variable presence");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(
  express.json({
    limit: "1mb",
    verify(req, _res, buffer) {
      (req as Request).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof SupabaseRequestError) {
      req.log.error(
        { supabaseCode: error.code, status: error.status },
        "Supabase data request failed",
      );
    } else {
      req.log.error(
        {
          errorName: error instanceof Error ? error.name : "UnknownThrownValue",
          errorMessage: error instanceof Error ? error.message.slice(0, 240) : undefined,
        },
        "Unhandled API error",
      );
    }
    if (
      error instanceof SupabaseRequestError &&
      (error.status >= 500 ||
        error.code === "PGRST205" ||
        error.code === "PGRST204" ||
        error.code === "PGRST200" ||
        error.code === "PGRST202" ||
        error.code === "PGRST125" ||
        error.code === "42P01" ||
        error.code === "42703")
    ) {
      res.status(503).json({
        message:
          error.code === "PGRST125" || error.code === "INVALID_URL"
            ? "Supabase URL configuration is invalid. Check the project URL setting."
            : error.code === "CONNECTION_FAILED"
              ? "Estatehold cannot reach Supabase. Check the project URL and Supabase service availability."
              : "Estatehold data is unavailable. Check the Supabase service and apply the project migration if the schema is missing.",
      });
      return;
    }
    res.status(500).json({ message: "The request could not be completed." });
  },
);

export default app;
