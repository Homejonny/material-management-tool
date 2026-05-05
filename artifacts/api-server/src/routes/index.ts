import { Router, type IRouter } from "express";
import healthRouter from "./health";
import materialsRouter from "./materials";
import presenceRouter from "./presence";
import ordersRouter from "./orders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(materialsRouter);
router.use(presenceRouter);
router.use(ordersRouter);

export default router;
