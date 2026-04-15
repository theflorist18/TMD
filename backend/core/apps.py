from django.apps import AppConfig
from django.conf import settings
from django.core.checks import Error, register


@register()
def check_subscriber_token_pepper(app_configs, **kwargs):
    if not settings.DEBUG and not (getattr(settings, "SUBSCRIBER_TOKEN_PEPPER", "") or "").strip():
        return [
            Error(
                "SUBSCRIBER_TOKEN_PEPPER must be set in the environment when DEBUG=False.",
                id="tmd.E001",
            )
        ]
    return []


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = "TMD core"

    def ready(self) -> None:
        import core.signals  # noqa: F401
