import os

from celery import Celery
from celery.signals import worker_process_init

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

app = Celery("glaze")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@worker_process_init.connect
def _init_otel(**kwargs):
    from backend.otel import configure_otel

    configure_otel()
