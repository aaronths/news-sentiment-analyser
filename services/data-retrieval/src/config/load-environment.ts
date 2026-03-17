import dotenv from "dotenv";
import path from "path";

export const loadEnvironment = () => {
  const candidates = new Set([
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(__dirname, "../../../../.env"),
  ]);

  for (const envPath of candidates) {
    dotenv.config({ path: envPath, override: false, quiet: true });
  }
};