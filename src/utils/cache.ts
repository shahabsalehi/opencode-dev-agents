type CacheEntry<T> = {
  value: T
  mtimeMs?: number
}

export class LruCache<K, V> {
  private map = new Map<K, CacheEntry<V>>()

  constructor(private readonly maxEntries: number) {}

  get(key: K): CacheEntry<V> | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    this.map.delete(key)
    this.map.set(key, entry)
    return entry
  }

  set(key: K, entry: CacheEntry<V>): void {
    if (this.map.has(key)) {
      this.map.delete(key)
    }
    this.map.set(key, entry)
    if (this.map.size > this.maxEntries) {
      const firstKey = this.map.keys().next().value
      if (firstKey !== undefined) {
        this.map.delete(firstKey)
      }
    }
  }
}

export const fileContentCache = new LruCache<string, string>(200)
export const analysisCache = new LruCache<string, unknown>(400)
export const parseCache = new LruCache<string, unknown>(200)
export const refactorCache = new LruCache<string, unknown>(100)
export const externalCache = new LruCache<string, string>(100)

export function getFileCacheKey(filePath: string, mtimeMs: number, suffix?: string): string {
  return `${filePath}:${mtimeMs}${suffix ? `:${suffix}` : ""}`
}
