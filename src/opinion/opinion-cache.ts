import { LruCache } from "../utils/cache.js"
import type { SecondOpinionResponse } from "./types.js"

export const opinionCache = new LruCache<string, SecondOpinionResponse>(50)
