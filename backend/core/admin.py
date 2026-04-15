from django.contrib import admin, messages
from .crypto import digest_for_storage, generate_subscriber_secret, get_subscriber_pepper
from .models import SubscriberToken


@admin.register(SubscriberToken)
class SubscriberTokenAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "label",
        "is_active",
        "expires_at",
        "last_used_at",
        "created_at",
        "created_by",
    )
    list_filter = ("is_active",)
    search_fields = ("label",)
    readonly_fields = ("token_hash", "created_at", "last_used_at", "created_by")

    def get_fields(self, request, obj=None):
        if obj is None:
            return ("label", "is_active", "expires_at")
        return (
            "label",
            "is_active",
            "expires_at",
            "token_hash",
            "created_at",
            "last_used_at",
            "created_by",
        )

    def get_readonly_fields(self, request, obj=None):
        if obj is None:
            return ()
        return self.readonly_fields

    def save_model(self, request, obj, form, change):
        if not change:
            raw = generate_subscriber_secret()
            obj.token_hash = digest_for_storage(raw, get_subscriber_pepper())
            obj.created_by = request.user
            super().save_model(request, obj, form, change)
            messages.warning(
                request,
                "Subscriber access code (copy now; it will not be shown again): "
                + raw,
            )
        else:
            super().save_model(request, obj, form, change)
