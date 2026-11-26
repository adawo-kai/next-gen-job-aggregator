# aiogram installs the uvloop event-loop policy on import. Import it before pytest-asyncio creates
# its session loop so the policy is the same for every test (otherwise tests after the bot test fail).
import aiogram  # noqa: F401
