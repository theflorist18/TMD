import subprocess
import sys
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run scripts/build_profiles.py at the repository root (same as manual pipeline)."

    def handle(self, *args, **options):
        repo_root = Path(settings.BASE_DIR).parent
        script = repo_root / "scripts" / "build_profiles.py"
        if not script.is_file():
            self.stderr.write(f"Missing {script}")
            sys.exit(1)
        self.stdout.write(f"Running {script} …")
        r = subprocess.run(
            [sys.executable, str(script)],
            cwd=str(repo_root),
        )
        if r.returncode != 0:
            sys.exit(r.returncode)
        self.stdout.write(self.style.SUCCESS("build_profiles.py finished OK."))
