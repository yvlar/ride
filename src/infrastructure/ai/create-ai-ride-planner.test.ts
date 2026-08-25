import { describe, expect, it } from "vitest";
import { createAiRidePlanner } from "./create-ai-ride-planner";
import { AiRidePlannerError } from "./ai-ride-planner-error";
import { HttpAiRidePlanner } from "./http-ai-ride-planner";

describe("createAiRidePlanner (FR-034)", () => {
  it("requires a server-only model key", () => {
    expect(() => createAiRidePlanner({ OPENAI_API_KEY: "" })).toThrow(
      AiRidePlannerError,
    );
  });

  it("builds the HTTP planner when a key is present", () => {
    const planner = createAiRidePlanner({
      OPENAI_API_KEY: "test-openai-key",
    });
    expect(planner).toBeInstanceOf(HttpAiRidePlanner);
  });
});
