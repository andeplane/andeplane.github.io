#!/usr/bin/env python3
"""Copy the verified web build into the Site's static deployment directory."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
source = root / "web" / "dist"
if not (source / "index.html").is_file():
    raise SystemExit("Run npm --prefix web run build first")
destination = root / "dist"
if destination.exists():
    shutil.rmtree(destination)
shutil.copytree(source, destination)
