import logging
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .crypto import find_active_subscriber_token, get_subscriber_pepper
from .models import SubscriberToken
from .throttling import SubscriberLoginThrottle

log = logging.getLogger("tmd.security")


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([SubscriberLoginThrottle])
def subscriber_login(request):
    raw = (request.data.get("token") or "").strip()
    if not raw:
        return Response({"detail": "invalid_credentials"}, status=400)

    from django.core.exceptions import ImproperlyConfigured

    try:
        pepper = get_subscriber_pepper()
    except ImproperlyConfigured:
        log.exception("subscriber_login pepper misconfiguration")
        return Response({"detail": "invalid_credentials"}, status=503)

    try:
        st = find_active_subscriber_token(raw, pepper)
    except Exception:
        log.exception("subscriber_login lookup failed")
        return Response({"detail": "invalid_credentials"}, status=500)

    if not st:
        log.info(
            "subscriber_login failed ip=%s",
            request.META.get("REMOTE_ADDR", ""),
        )
        return Response({"detail": "invalid_credentials"}, status=401)

    if st.expires_at and st.expires_at < timezone.now():
        log.info("subscriber_login expired id=%s", st.pk)
        return Response({"detail": "subscriber_expired"}, status=401)

    User = get_user_model()
    user, _ = User.objects.get_or_create(
        username=f"subscriber_{st.pk}",
        defaults={"is_active": True},
    )
    refresh = RefreshToken.for_user(user)
    refresh["sid"] = st.id

    SubscriberToken.objects.filter(pk=st.pk).update(last_used_at=timezone.now())

    return Response(
        {"refresh": str(refresh), "access": str(refresh.access_token)},
        status=200,
    )


def _data_file(name: str) -> Path:
    root: Path = settings.TMD_DATA_ROOT
    path = (root / name).resolve()
    if not str(path).startswith(str(root.resolve())):
        raise Http404()
    return path


class DatasetFileView(APIView):
    """Stream a dataset file from TMD_DATA_ROOT after JWT auth."""

    permission_classes = [IsAuthenticated]
    filename: str
    content_type: str

    def get(self, request):
        path = _data_file(self.filename)
        if not path.is_file():
            raise Http404()
        return FileResponse(
            path.open("rb"),
            as_attachment=False,
            content_type=self.content_type,
            filename=self.filename,
        )


class HoldersCsvView(DatasetFileView):
    filename = "one_percent_holders.csv"
    content_type = "text/csv; charset=utf-8"


class IntelProfilesView(DatasetFileView):
    filename = "investor_profiles.json"
    content_type = "application/json"


class IntelGroupsView(DatasetFileView):
    filename = "investor_groups.json"
    content_type = "application/json"


class IntelGroupCandidatesView(DatasetFileView):
    """Heuristic clusters when verified ``investor_groups.json`` is empty."""

    filename = "investor_group_candidates.json"
    content_type = "application/json"
