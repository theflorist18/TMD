"""JWT auth that requires subscriber token id (`sid`) to still be active (revocation without waiting for expiry)."""

from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import SubscriberToken


class SubscriberJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        sid = validated_token.get("sid")
        if sid is None:
            raise AuthenticationFailed(
                "Token missing scope", code="token_not_valid"
            )
        if not SubscriberToken.objects.filter(pk=sid, is_active=True).exists():
            raise AuthenticationFailed(
                "Subscriber access revoked", code="token_revoked"
            )
        return user
