from django.conf import settings
from django.db import models


class SubscriberToken(models.Model):
    """Subscriber access code: store HMAC-SHA256 hex (with pepper); raw secret never persisted."""

    label = models.CharField(max_length=200, blank=True)
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_subscriber_tokens",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.label or f"Token#{self.pk}"
