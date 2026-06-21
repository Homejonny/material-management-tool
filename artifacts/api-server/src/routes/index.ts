import { Router, type IRouter } from "express";
import healthRouter from "./health";
import materialsRouter from "./materials";
import ordersRouter from "./orders";
import presenceRouter from "./presence";
import quotesRouter from "./quotes";
import scheduleRouter from "./schedule";
import downloadRouter from "./download";
import emailRouter from "./email";
import genericMaterialsRouter from "./generic-materials";
import rfqRouter from "./rfq";

const router: IRouter = Router();

router.use(healthRouter);
router.use(materialsRouter);
router.use(ordersRouter);
router.use(presenceRouter);
router.use(quotesRouter);
router.use(scheduleRouter);
router.use(downloadRouter);
router.use(emailRouter);
router.use(genericMaterialsRouter);
router.use(rfqRouter);

export default router;
