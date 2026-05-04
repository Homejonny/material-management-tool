import { Router, type IRouter } from "express";
import healthRouter from "./health";
import materialsRouter from "./materials";

const router: IRouter = Router();

router.use(healthRouter);
router.use(materialsRouter);

export default router;
