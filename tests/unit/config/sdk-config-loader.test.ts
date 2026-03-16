import { describe, expect, it } from "vitest"
import { loadProjectPluginConfig } from "../../../src/sdk/config-loader.js"

describe("sdk config loader", () => {
  it("loads plugin config from sdk file response", async () => {
    const client = {
      file: {
        read: async () => ({
          data: {
            type: "text",
            content: JSON.stringify({
              plugin: {
                "swe-sworm": {
                  approval: {
                    ttlMs: 180000,
                  },
                },
              },
            }),
          },
        }),
      },
    }

    const loaded = await loadProjectPluginConfig(client, "/repo")

    expect(loaded).toEqual({
      approval: {
        ttlMs: 180000,
      },
    })
  })

  it("returns empty object for invalid json", async () => {
    const client = {
      file: {
        read: async () => ({
          data: {
            type: "text",
            content: "{bad json",
          },
        }),
      },
    }

    const loaded = await loadProjectPluginConfig(client, "/repo")
    expect(loaded).toEqual({})
  })

  it("returns empty object when plugin key is absent", async () => {
    const client = {
      file: {
        read: async () => ({
          data: {
            type: "text",
            content: JSON.stringify({ tools: {} }),
          },
        }),
      },
    }

    const loaded = await loadProjectPluginConfig(client, "/repo")
    expect(loaded).toEqual({})
  })

  it("returns empty object when sdk read throws", async () => {
    const client = {
      file: {
        read: async () => {
          throw new Error("not found")
        },
      },
    }

    const loaded = await loadProjectPluginConfig(client, "/repo")
    expect(loaded).toEqual({})
  })
})
