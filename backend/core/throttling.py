from rest_framework.throttling import SimpleRateThrottle


class SubscriberLoginThrottle(SimpleRateThrottle):
    """Rate limit by IP for POST /api/v1/auth/login/."""

    scope = "subscriber_login"

    def get_cache_key(self, request, view):
        if request.method != "POST":
            return None
        ident = self.get_ident(request) or "unknown"
        return self.cache_format % {"scope": self.scope, "ident": ident}
