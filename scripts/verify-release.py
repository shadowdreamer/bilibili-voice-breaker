"""Validate release contents and write a checksum. Uses Python standard library only."""
import hashlib
import json
import os
import re
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent


def verify():
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    version = package["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Release version must use major.minor.patch")
    tag = os.environ.get("RELEASE_TAG", f"v{version}")
    if tag != f"v{version}":
        raise ValueError(f"Tag {tag} does not match package version {version}")
    if lock["version"] != version or lock["packages"][""]["version"] != version:
        raise ValueError("package-lock.json version does not match package.json")
    archive = ROOT / ".output" / f"bilibili-voice-breaker-{version}-chrome.zip"
    with ZipFile(archive) as extension:
        names = set(extension.namelist())
        if extension.testzip() is not None:
            raise ValueError("ZIP integrity check failed")
        for name in names:
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts or "\\" in name:
                raise ValueError(f"Invalid ZIP entry: {name}")
            if name != "LICENSE" and not (
                path.parts[0] in {"assets", "chunks", "content-scripts", "icons"}
                or name in {"manifest.json", "background.js", "popup.html", "options.html"}
            ):
                raise ValueError(f"Unexpected release file: {name}")
        manifest = json.loads(extension.read("manifest.json"))
        if manifest.get("manifest_version") != 3 or manifest["version"] != version:
            raise ValueError("Manifest version mismatch")
        if extension.read("LICENSE") != (ROOT / "LICENSE").read_bytes():
            raise ValueError("Release must include the project license")
        required = [
            *manifest["icons"].values(),
            *manifest["action"]["default_icon"].values(),
            manifest["action"]["default_popup"],
            manifest["options_ui"]["page"],
            manifest["background"]["service_worker"],
        ]
        for script in manifest["content_scripts"]:
            required.extend(script.get("js", []))
            required.extend(script.get("css", []))
        missing = set(required) - names
        if missing:
            raise ValueError(f"Missing runtime files: {sorted(missing)}")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    checksum = archive.with_suffix(archive.suffix + ".sha256")
    checksum.write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(f"Verified {tag}: {len(names)} files, {archive.stat().st_size:,} bytes")
    print(f"SHA-256: {digest}")


if __name__ == "__main__":
    verify()

