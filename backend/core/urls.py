from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("auth/login/", views.subscriber_login),
    path("auth/token/refresh/", TokenRefreshView.as_view()),
    path(
        "datasets/one_percent_holders.csv/",
        views.HoldersCsvView.as_view(),
    ),
    path(
        "datasets/investor_profiles.json/",
        views.IntelProfilesView.as_view(),
    ),
    path(
        "datasets/investor_groups.json/",
        views.IntelGroupsView.as_view(),
    ),
    path(
        "datasets/investor_group_candidates.json/",
        views.IntelGroupCandidatesView.as_view(),
    ),
]
