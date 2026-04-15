import logging

from django.contrib.auth.signals import user_login_failed
from django.dispatch import receiver

log = logging.getLogger("tmd.security")


@receiver(user_login_failed)
def log_failed_admin_login(sender, credentials, request, **kwargs):
    log.warning(
        "django_admin_login_failed username=%s ip=%s",
        credentials.get("username", ""),
        getattr(request, "META", {}).get("REMOTE_ADDR", ""),
    )
