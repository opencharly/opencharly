"""Install the Codex plugins selected by the umbrella's pinned marketplace catalog."""

import json
from pathlib import Path
import subprocess


def codex_json(*args):
    output = subprocess.check_output(["codex", "plugin", *args, "--json"], text=True)
    return json.loads(output)


def main():
    catalog_path = Path(__file__).resolve().parents[1] / "marketplace/.agents/plugins/marketplace.json"
    catalog = json.loads(catalog_path.read_text())
    name = catalog["name"]
    expected = {
        f"{plugin['name']}@{name}"
        for plugin in catalog["plugins"]
        if plugin["policy"]["installation"] == "INSTALLED_BY_DEFAULT"
    }
    if not expected:
        raise SystemExit(f"{catalog_path} declares no default plugins")

    marketplaces = codex_json("marketplace", "list")["marketplaces"]
    if any(marketplace["name"] == name for marketplace in marketplaces):
        subprocess.run(["codex", "plugin", "marketplace", "upgrade", name], check=True)
    else:
        subprocess.run(["codex", "plugin", "marketplace", "add", "opencharly/marketplace"], check=True)
    for plugin_id in sorted(expected):
        subprocess.run(["codex", "plugin", "add", plugin_id], check=True)

    inventory = codex_json("list", "--marketplace", name)["installed"]
    active = {p["pluginId"] for p in inventory if p["installed"] and p["enabled"]}
    missing = sorted(expected - active)
    if missing:
        raise SystemExit("Codex plugins missing or disabled: " + ", ".join(missing))
    print(f"bootstrap: codex: verified {len(expected)} installed and enabled plugins")


if __name__ == "__main__":
    main()
