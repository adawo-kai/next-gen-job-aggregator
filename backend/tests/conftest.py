import os

# The integration suite fires many requests from one "IP"; the limiter has its own dedicated test.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

# aiogram installs the uvloop event-loop policy on import. Import it before pytest-asyncio creates
# its session loop so the policy is the same for every test (otherwise tests after the bot test fail).
import aiogram  # noqa: E402,F401
