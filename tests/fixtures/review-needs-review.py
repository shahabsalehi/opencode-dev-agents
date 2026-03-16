password = "hardcoded-super-secret"
api_key = "api-key-123456789"
secret = "another-very-secret-value"


def read_unsafe_value() -> str:
    return f"{password}:{api_key}:{secret}"
