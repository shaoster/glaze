"""Entry point: python -m potterdoc_mcp"""

from potterdoc_mcp.server import mcp


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
