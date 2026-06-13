"""Entry point: python -m potterdoc_mcp"""

import asyncio

from potterdoc_mcp.server import mcp


def main() -> None:
    asyncio.run(mcp.run_async(transport="stdio"))


if __name__ == "__main__":
    main()
