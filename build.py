#!/usr/bin/env python3
"""Build dist/index.html from the page source and the dictionary.

The game ships as a single self-contained HTML file: no server, no install,
nothing to load on a phone but the page itself. Keeping it that way means the
dictionary has to live inside the page, so the template leaves a placeholder
and this script fills it in.

    python3 build.py
"""

import gzip
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
TEMPLATE = ROOT / "src" / "template.html"
DICTIONARY = ROOT / "data" / "dictionary.json"
OUTPUT = ROOT / "dist" / "index.html"
PLACEHOLDER = "/*__DICT__*/null"


def main() -> None:
    template = TEMPLATE.read_text(encoding="utf-8")
    if template.count(PLACEHOLDER) != 1:
        sys.exit(f"{TEMPLATE} must contain {PLACEHOLDER} exactly once")

    data = json.loads(DICTIONARY.read_text(encoding="utf-8"))
    page = template.replace(PLACEHOLDER, json.dumps(data, ensure_ascii=False))

    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(page, encoding="utf-8")

    encoded = page.encode("utf-8")
    words = len(data["words"].splitlines()) + len(data["geo"].splitlines())
    print(f"{OUTPUT.relative_to(ROOT)}  "
          f"{len(encoded) / 1e6:.2f} MB  "
          f"({len(gzip.compress(encoded)) / 1e6:.2f} MB over the wire)")
    print(f"{words:,} words · {len(data['defs']):,} definitions · "
          f"{len(data['ko']):,} Korean glosses")


if __name__ == "__main__":
    main()
