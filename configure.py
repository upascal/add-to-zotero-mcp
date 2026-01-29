#!/usr/bin/env python3
"""
Interactive configuration script for Add to Zotero MCP Server.

Run this once after cloning the project:
    python configure.py

It will guide you through setting up your Zotero API credentials.
"""

import json
import os
import platform
import sys
import webbrowser
from pathlib import Path

# Get the directory where this script lives
SCRIPT_DIR = Path(__file__).parent.resolve()
ENV_FILE = SCRIPT_DIR / ".env"
ZOTERO_KEYS_URL = "https://www.zotero.org/settings/keys"


def get_claude_config_path() -> Path | None:
    """Return the Claude Desktop config path for this OS, or None if unknown."""
    system = platform.system()
    if system == "Darwin":  # macOS
        return Path.home() / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
    elif system == "Windows":
        appdata = os.environ.get("APPDATA")
        if appdata:
            return Path(appdata) / "Claude" / "claude_desktop_config.json"
    elif system == "Linux":
        # Claude Desktop doesn't officially support Linux, but check XDG path just in case
        xdg_config = os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")
        return Path(xdg_config) / "Claude" / "claude_desktop_config.json"
    return None


def prompt_yes_no(question: str, default: bool = True) -> bool:
    """Ask a yes/no question and return True for yes, False for no."""
    suffix = " [Y/n]: " if default else " [y/N]: "
    while True:
        answer = input(question + suffix).strip().lower()
        if not answer:
            return default
        if answer in ("y", "yes"):
            return True
        if answer in ("n", "no"):
            return False
        print("Please answer 'y' or 'n'.")


def main():
    print()
    print("=" * 60)
    print("  Add to Zotero — Configuration")
    print("=" * 60)
    print()

    # Check if user needs to get API key
    if prompt_yes_no("Do you already have a Zotero API key?"):
        pass
    else:
        print(f"\nOpening {ZOTERO_KEYS_URL} in your browser...")
        print("Create a new API key with 'Allow write access' enabled.")
        print("Your Library ID is shown at the top of the page.\n")
        webbrowser.open(ZOTERO_KEYS_URL)
        input("Press Enter when you have your API key and Library ID ready...")
        print()

    # Get credentials
    api_key = input("Enter your Zotero API key: ").strip()
    if not api_key:
        print("Error: API key cannot be empty.")
        sys.exit(1)

    library_id = input("Enter your Zotero Library ID (the number): ").strip()
    if not library_id:
        print("Error: Library ID cannot be empty.")
        sys.exit(1)

    # Write .env file
    print(f"\nWriting credentials to {ENV_FILE}...")
    with open(ENV_FILE, "w") as f:
        f.write(f"ZOTERO_API_KEY={api_key}\n")
        f.write(f"ZOTERO_LIBRARY_ID={library_id}\n")
    print("✓ Created .env file")

    # Optionally configure Claude Desktop
    config_path = get_claude_config_path()
    if config_path and config_path.parent.exists():
        print()
        if prompt_yes_no("Would you like to automatically configure Claude Desktop?"):
            configure_claude_desktop(config_path, api_key, library_id)
    elif config_path:
        print(f"\nNote: Claude Desktop config directory not found at:")
        print(f"  {config_path.parent}")
        print("You may need to configure Claude Desktop manually (see README.md).")

    print()
    print("=" * 60)
    print("  Setup complete!")
    print("=" * 60)
    print()
    print("Next steps:")
    print("  1. Restart Claude Desktop (Cmd+Q / Alt+F4, then reopen)")
    print("  2. Look for 'add-to-zotero' in Claude's tools menu")
    print("  3. Try asking Claude to add something to your Zotero library!")
    print()


def configure_claude_desktop(config_path: Path, api_key: str, library_id: str):
    """Add or update the MCP server entry in Claude Desktop config."""
    server_name = "add-to-zotero"
    server_config = {
        "command": str(SCRIPT_DIR / ".venv" / "bin" / "python"),
        "args": [str(SCRIPT_DIR / "server.py")],
        "env": {
            "ZOTERO_API_KEY": api_key,
            "ZOTERO_LIBRARY_ID": library_id,
        }
    }

    # Handle Windows path
    if platform.system() == "Windows":
        server_config["command"] = str(SCRIPT_DIR / ".venv" / "Scripts" / "python.exe")

    try:
        # Load existing config or create new one
        if config_path.exists():
            with open(config_path, "r") as f:
                config = json.load(f)
        else:
            config = {}

        # Ensure mcpServers key exists
        if "mcpServers" not in config:
            config["mcpServers"] = {}

        # Check if server already exists
        if server_name in config["mcpServers"]:
            if not prompt_yes_no(f"'{server_name}' already exists in config. Overwrite?", default=False):
                print("Skipping Claude Desktop configuration.")
                return

        # Add/update server config
        config["mcpServers"][server_name] = server_config

        # Write back
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)

        print(f"✓ Added '{server_name}' to Claude Desktop config")
        print(f"  Path: {config_path}")

    except json.JSONDecodeError as e:
        print(f"Error: Could not parse Claude Desktop config: {e}")
        print("You may need to configure it manually (see README.md).")
    except PermissionError:
        print(f"Error: Permission denied writing to {config_path}")
        print("You may need to configure it manually (see README.md).")
    except Exception as e:
        print(f"Error configuring Claude Desktop: {e}")
        print("You may need to configure it manually (see README.md).")


if __name__ == "__main__":
    main()
