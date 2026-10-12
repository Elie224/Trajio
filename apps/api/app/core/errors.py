"""Domain and transport error types shared across modules."""


class TrajioError(Exception):
    """Base class for all expected (non-bug) application errors."""

    status_code: int = 400
    code: str = "bad_request"

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code


class NotFoundError(TrajioError):
    status_code = 404
    code = "not_found"


class PermissionDeniedError(TrajioError):
    status_code = 403
    code = "permission_denied"


class ConflictError(TrajioError):
    status_code = 409
    code = "conflict"


class ValidationError(TrajioError):
    status_code = 422
    code = "validation_error"
