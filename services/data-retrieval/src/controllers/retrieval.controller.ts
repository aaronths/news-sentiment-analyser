import { Request, Response } from "express";

export const performTest = async (req: Request, res: Response) => {
  res.json({ success: true });
};

