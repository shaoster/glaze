import logging
from contextlib import contextmanager
from opentelemetry import trace as otel_trace
from contextvars import ContextVar
from typing import Generator

# Context variable to hold the current task ID for log correlation.
# Using contextvars ensures thread-safety when running tasks in a ThreadPoolExecutor.
_task_id_var: ContextVar[str | None] = ContextVar("task_id", default=None)


@contextmanager
def task_context(task_id: str) -> Generator[None, None, None]:
    """Context manager to set the current task ID for log correlation.

    All logs emitted within this context (including in nested calls) will
    be decorated with the task_id if the TaskCorrelationFilter is installed.
    """
    token = _task_id_var.set(task_id)
    try:
        yield
    finally:
        _task_id_var.reset(token)


class TaskCorrelationFilter(logging.Filter):
    """Logging filter that injects the current task_id into LogRecords.

    This allows log formatters (and external aggregators like Logtail)
    to group logs by background task.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        task_id = _task_id_var.get()
        if task_id:
            setattr(record, "task_id", task_id)
        return True


class OtelTraceFilter(logging.Filter):
    """Logging filter that injects the current OTel trace_id and span_id into LogRecords."""

    def filter(self, record: logging.LogRecord) -> bool:
        span = otel_trace.get_current_span()
        ctx = span.get_span_context()
        if ctx and ctx.is_valid:
            record.trace_id = format(ctx.trace_id, "032x")
            record.span_id = format(ctx.span_id, "016x")
        else:
            record.trace_id = ""
            record.span_id = ""
        return True


def setup_logging() -> None:
    """Register the TaskCorrelationFilter with the root logger."""
    root = logging.getLogger()
    # Avoid adding multiple filters if setup_logging is called more than once.
    if not any(isinstance(f, TaskCorrelationFilter) for f in root.filters):
        root.addFilter(TaskCorrelationFilter())
    if not any(isinstance(f, OtelTraceFilter) for f in root.filters):
        root.addFilter(OtelTraceFilter())
