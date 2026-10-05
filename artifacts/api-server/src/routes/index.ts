import { Router, type IRouter } from "express";
import accountRouter from "./account";
import adminRouter from "./admin";
import catalogRouter from "./catalog";
import healthRouter from "./health";
import paymentsRouter from "./payments";
import requestsRouter from "./requests";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(requestsRouter);
router.use(accountRouter);
router.use(paymentsRouter);
router.use(adminRouter);

export default router;
