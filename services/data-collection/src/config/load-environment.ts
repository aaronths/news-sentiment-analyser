import dotenv from "dotenv";
import path from "path";

export const loadEnvironment = () => {
  const envName = process.env.NODE_ENV?.trim();
  const candidates = new Set<string>([
    path.resolve(process.cwd(), ".env"),
    ...(envName ? [path.resolve(process.cwd(), `.env.${envName}`)] : []),
    path.resolve(process.cwd(), "../../.env"),
    ...(envName ? [path.resolve(process.cwd(), `../../.env.${envName}`)] : []),
    path.resolve(__dirname, "../../../../.env"),
    ...(envName ? [path.resolve(__dirname, `../../../../.env.${envName}`)] : []),
  ]);

  for (const envPath of candidates) {
    dotenv.config({ path: envPath, override: false, quiet: true });
  }
};
