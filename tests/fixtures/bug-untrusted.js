const password = "hardcoded-super-secret"
const apiKey = "api-key-123456789"
const secret = "another-very-secret-value"
const randomValue = Math.random()

export function readUnsafeValue() {
  return `${password}:${apiKey}:${secret}:${randomValue}`
}
