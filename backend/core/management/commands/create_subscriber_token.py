from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.crypto import (
    SUBSCRIBER_SECRET_LENGTH,
    digest_for_storage,
    generate_subscriber_secret,
    get_subscriber_pepper,
)
from core.models import SubscriberToken


class Command(BaseCommand):
    help = "Create a subscriber token (prints the raw secret once; store it securely)."

    def add_arguments(self, parser):
        parser.add_argument("--label", default="", help="Admin note / buyer reference")
        parser.add_argument(
            "--expires-days",
            type=int,
            default=None,
            help="Optional expiry in days from now",
        )
        parser.add_argument(
            "--length",
            type=int,
            default=None,
            metavar="N",
            help=(
                "Number of characters in the secret "
                f"(default: {SUBSCRIBER_SECRET_LENGTH})"
            ),
        )

    def handle(self, *args, **options):
        try:
            raw = generate_subscriber_secret(options["length"])
        except ValueError as e:
            raise CommandError(str(e)) from e
        digest = digest_for_storage(raw, get_subscriber_pepper())
        exp = None
        if options["expires_days"] is not None:
            exp = timezone.now() + timedelta(days=options["expires_days"])
        st = SubscriberToken.objects.create(
            label=options["label"] or "",
            token_hash=digest,
            expires_at=exp,
        )
        self.stdout.write(self.style.SUCCESS(f"SubscriberToken id={st.pk} created."))
        self.stdout.write(self.style.WARNING("Give this token to the subscriber once:"))
        self.stdout.write(raw)
