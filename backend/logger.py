import os
import sys
import logging
import re
from logging.handlers import RotatingFileHandler

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


class RedactingFilter(logging.Filter):
    """Remove credentials and sensitive free-form fields from every handler."""

    _patterns = [
        re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+"),
        re.compile(r"(?i)(authorization[\"']?\s*[:=]\s*[\"']?)[^\s,}\"']+"),
        re.compile(r"(?i)((?:user_)?notes?[\"']?\s*[:=]\s*[\"']?)[^,}\n]+"),
    ]

    def __init__(self):
        super().__init__()
        self.secrets = tuple(
            value for name in (
                "GOOGLE_MAPS_API_KEY", "GEMINI_API_KEY", "YELP_API_KEY",
                "FOURSQUARE_API_KEY", "DOCUMENU_API_KEY",
            ) if (value := os.getenv(name))
        )

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        for secret in self.secrets:
            message = message.replace(secret, "[REDACTED]")
        for pattern in self._patterns:
            message = pattern.sub(r"\1[REDACTED]", message)
        record.msg = message
        record.args = ()
        return True


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            from observability import get_request_id
            record.request_id = get_request_id()
        except Exception:
            record.request_id = "-"
        return True

# Ensure logs directory exists
LOGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(LOGS_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOGS_DIR, "biteradar.log")

# Create logger
logger = logging.getLogger("biteradar")
logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

# Prevent duplicate handlers if re-imported
if not logger.handlers:
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-7s | request_id=%(request_id)s | %(name)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.addFilter(RequestIdFilter())
    console_handler.addFilter(RedactingFilter())
    logger.addHandler(console_handler)

    # Rotating file handler (10MB max, keep 5 backup files)
    file_handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    file_handler.addFilter(RequestIdFilter())
    file_handler.addFilter(RedactingFilter())
    logger.addHandler(file_handler)

def get_logger(name: str) -> logging.Logger:
    """Return a child logger for a specific module."""
    return logging.getLogger(f"biteradar.{name}")
