import express, { type Express, type Request } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { SupabaseRequestError } from "./lib/supabase";

const app: Express = express();

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
    req.log.error({ error }, "Unhandled API error");
    if (
      error instanceof SupabaseRequestError &&
      (error.code === "PGRST205" || error.code === "42P01")
    ) {
      res.status(503).json({
        message: "Estatehold database setup is incomplete. Apply the Supabase migration first.",
      });
      return;
    }
    res.status(500).json({ message: "The request could not be completed." });
  },
);

export default app;
