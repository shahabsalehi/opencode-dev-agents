import type { SwarmConfig } from "../config.js"

type FileReaderClient = {
  file: {
    read(args: {
      query: {
        directory?: string
        path: string
      }
    }): Promise<{
      data?: {
        type?: string
        content?: string
      }
    }>
  }
}

export async function loadProjectPluginConfig(
  client: FileReaderClient,
  directory: string
): Promise<SwarmConfig> {
  try {
    const response = await client.file.read({
      query: {
        directory,
        path: ".opencode/swe-sworm.json",
      },
    })

    const content = response.data?.content
    if (response.data?.type !== "text" || typeof content !== "string" || content.length === 0) {
      return {}
    }

    const parsed = JSON.parse(content) as {
      plugin?: {
        "swe-sworm"?: unknown
      }
    }

    const configValue = parsed.plugin?.["swe-sworm"]
    if (isPlainObject(configValue)) {
      return configValue as SwarmConfig
    }

    return {}
  } catch {
    return {}
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
