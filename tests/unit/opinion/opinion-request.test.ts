import { describe, expect, it, vi } from "vitest"
import { requestSecondOpinion } from "../../../src/opinion/request.js"

describe("requestSecondOpinion", () => {
  it("returns fail-safe when create fails", async () => {
    const response = await requestSecondOpinion({
      client: {
        session: {
          create: vi.fn().mockRejectedValue(new Error("missing agent")),
          prompt: vi.fn(),
          messages: vi.fn(),
        },
      },
      request: {
        planTitle: "plan:a",
        planContent: "content",
        toolName: "edit",
        sessionID: "s1",
        mutationCount: 1,
        policyRisk: "high",
      },
      agent: "second-opinion",
      timeoutMs: 1000,
      tier: "lightweight",
    })

    expect(response.verdict).toBe("proceed")
  })

  it("returns parsed response when session returns assistant JSON", async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: "child-1" } })
    const prompt = vi.fn().mockResolvedValue({})
    const messages = vi.fn().mockResolvedValue({
      data: [
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: '{"verdict":"caution","risks":["risk"],"suggestion":"fix","confidence":0.6}' }],
        },
      ],
    })

    const response = await requestSecondOpinion({
      client: { session: { create, prompt, messages } },
      request: {
        planTitle: "plan:a",
        planContent: "content",
        toolName: "edit",
        sessionID: "s1",
        mutationCount: 1,
        policyRisk: "high",
      },
      agent: "second-opinion",
      timeoutMs: 1000,
      tier: "lightweight",
    })

    expect(response.verdict).toBe("caution")
    expect(response.risks).toEqual(["risk"])
  })
})
