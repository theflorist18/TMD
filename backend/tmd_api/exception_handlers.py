import logging

from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

log = logging.getLogger("tmd.api")


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    req = context.get("request")
    path = getattr(req, "path", "") if req else ""
    if response is None:
        log.exception("Unhandled DRF exception path=%s", path)
        return Response({"detail": "server_error"}, status=500)
    if response.status_code >= 500 and not settings.DEBUG:
        log.exception("Server error path=%s", path)
        return Response({"detail": "server_error"}, status=500)
    return response
