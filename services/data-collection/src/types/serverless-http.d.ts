declare module "serverless-http" {
  import type { Handler } from "aws-lambda";
  import type { RequestHandler } from "express";

  function serverless(app: RequestHandler): Handler;
  export default serverless;
}
