import { Router, type IRouter } from "express";
import accountRouter from "./account";
import adminRouter from "./admin";
import catalogRouter from "./catalog";
import healthRouter from "./health";
import kycRouter from "./kyc";
import paymentsRouter from "./payments";
import requestsRouter from "./requests";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(requestsRouter);
router.use(accountRouter);
router.use(paymentsRouter);
router.use(adminRouter);
router.use(kycRouter);

export default router;
