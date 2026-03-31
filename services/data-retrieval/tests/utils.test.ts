import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { logger } from "../src/utils/logger";

describe("utils/logger", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("logger.info logs a structured INFO message", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    logger.info("Test info", { requestId: "abc-123" });

    expect(logSpy).toHaveBeenCalledTimes(1);

    const raw = logSpy.mock.calls[0][0] as string;
    const payload = JSON.parse(raw);

    expect(payload.level).toBe("INFO");
    expect(payload.message).toBe("Test info");
    expect(payload.requestId).toBe("abc-123");
    expect(payload.timestamp).toBeDefined();
  });

  it("logger.error logs a structured ERROR message with error text", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    logger.error("Test error", new Error("Something failed"), { route: "/health" });

    expect(errorSpy).toHaveBeenCalledTimes(1);

    const raw = errorSpy.mock.calls[0][0] as string;
    const payload = JSON.parse(raw);

    expect(payload.level).toBe("ERROR");
    expect(payload.message).toBe("Test error");
    expect(payload.error).toBe("Something failed");
    expect(payload.route).toBe("/health");
    expect(payload.timestamp).toBeDefined();
  });
});