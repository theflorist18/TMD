from django.test import TestCase, override_settings

from core.crypto import (
    SUBSCRIBER_SECRET_ALPHABET,
    SUBSCRIBER_SECRET_LENGTH,
    digest_for_storage,
    find_active_subscriber_token,
    generate_subscriber_secret,
    get_subscriber_pepper,
)
from core.models import SubscriberToken


class SubscriberSecretTests(TestCase):
    def test_generate_default_length_and_charset(self):
        for _ in range(30):
            s = generate_subscriber_secret()
            self.assertEqual(len(s), SUBSCRIBER_SECRET_LENGTH)
            for ch in s:
                self.assertIn(ch, SUBSCRIBER_SECRET_ALPHABET)

    def test_generate_custom_length(self):
        s = generate_subscriber_secret(12)
        self.assertEqual(len(s), 12)

    def test_generate_rejects_short(self):
        with self.assertRaises(ValueError):
            generate_subscriber_secret(5)

    @override_settings(DEBUG=True, SUBSCRIBER_TOKEN_PEPPER="")
    def test_login_roundtrip_hash_only_in_db(self):
        raw = generate_subscriber_secret()
        pepper = get_subscriber_pepper()
        h = digest_for_storage(raw, pepper)
        st = SubscriberToken.objects.create(label="__test__", token_hash=h, is_active=True)
        found = find_active_subscriber_token(raw, pepper)
        self.assertIsNotNone(found)
        self.assertEqual(found.pk, st.pk)
        st.delete()
