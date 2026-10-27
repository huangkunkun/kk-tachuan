"""Check the actual release ZIP, icons, disclosure files and listing assets."""
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import sys
from zipfile import ZipFile, ZIP_DEFLATED

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
version = manifest["version"]
name = f"kk-tachuan-{version}"
release = root / "releases" / f"{name}.zip"
expected = {
    "manifest.json", "background.js", "core.js", "panel-adapter.js",
    "vendor/canvas-confetti.js", "vendor/canvas-confetti.LICENSE.txt", "vendor/README.md",
    "celebration.js", "content.js", "README.md", "LICENSE", "PRIVACY.md", "CHANGELOG.md",
    "docs/compatibility.md", "docs/compatibility-v13.1.0.jpg", *(f"icons/icon-{size}.png" for size in (16, 32, 48, 128)),
}
assert manifest["name"] == "KK塔传 · KK宝塔文件上传助手"
assert version == "1.1.0"
assert len(manifest["description"]) <= 132
assert manifest["permissions"] == ["activeTab", "scripting"]
assert not any(key in manifest for key in ("host_permissions", "content_scripts", "externally_connectable", "update_url"))

with ZipFile(release) as archive:
    assert archive.testzip() is None, "ZIP CRC failure"
    members = archive.namelist()
    assert len(members) == len(set(members)), "Duplicate ZIP members"
    assert set(members) == expected, "Missing or unexpected distribution files"
    assert json.loads(archive.read("manifest.json")) == manifest
    for member in members:
        data = archive.read(member)
        assert data == (root / member).read_bytes(), f"Stale ZIP member: {member}"
        if member.endswith((".js", ".json", ".md", ".txt")):
            text = data.decode("utf-8")
            assert not re.search(r"测试|试用|(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])", text), f"Old branding or possible private address: {member}"
            assert not re.search(r"(?<!KK)塔传|(?<!KK)宝塔文件上传助手", text), f"Missing KK branding: {member}"
    for size, member in manifest["icons"].items():
        with Image.open(BytesIO(archive.read(member))) as icon:
            assert icon.format == "PNG"
            assert icon.size == (int(size), int(size))
            assert icon.mode == "RGBA"
            if size == "128":
                bbox = icon.getchannel("A").getbbox()
                assert bbox == (16, 16, 112, 112), bbox
    for size, member in manifest["action"]["default_icon"].items():
        assert manifest["icons"][size] == member
    assert "ISC" in archive.read("vendor/canvas-confetti.LICENSE.txt").decode("utf-8")

for module in ("core.js", "panel-adapter.js", "celebration.js", "content.js"):
    source = (root / module).read_text(encoding="utf-8")
    assert version in source
    assert not re.search(r'(?:version\s*[=:]|version\s*!==)\s*"(?:0\.1\.[0-9]+|1\.0\.0)"', source)

adapter_source = (root / "panel-adapter.js").read_text(encoding="utf-8")
supported_versions = json.loads(re.search(r'supportedPanelVersions=Object.freeze\((\[.*?\])\)', adapter_source).group(1))
assert supported_versions == ["9.3.0", "9.4.0", "9.5.0", "9.6.0", "11.0.0", "11.1.0", "11.2.0", "11.3.0", "11.4.0", "11.4.1", "11.5.0", "11.6.0", "11.7.0", "11.8.0", "11.8.1", "13.0.0", "13.1.0"]

digest = hashlib.sha256(release.read_bytes()).hexdigest()
assert (release.with_suffix(".sha256")).read_text(encoding="utf-8").strip() == f"{digest}  {name}.zip"
asset_sizes = {}
for filename, size in (("promo-440x280.png", (440,280)), ("preview.jpg", (1280,720))):
    with Image.open(root / "publishing" / filename) as picture:
        assert picture.size == size, (filename, picture.size)
        assert picture.format in ("PNG", "JPEG")
        asset_sizes[filename] = list(picture.size)
for document in ("privacy.html", "商店发布资料.md"):
    text = (root / "publishing" / document).read_text(encoding="utf-8")
    assert "KK塔传" in text and "测试" not in text

# Keep store copy and promotional files separate from the executable extension.
materials = root / "releases" / f"{name}-publishing.zip"
with ZipFile(materials, "w", ZIP_DEFLATED, compresslevel=9) as bundle:
    for source in sorted((root / "publishing").iterdir()):
        if source.is_file() and source.name != "screenshot-1280x800.jpg":
            bundle.write(source, source.name)
    for source in sorted((root / "icons").iterdir()):
        if source.is_file():
            bundle.write(source, "icons/" + source.name)
with ZipFile(materials) as bundle:
    assert bundle.testzip() is None
materials_digest = hashlib.sha256(materials.read_bytes()).hexdigest()
materials.with_suffix(".sha256").write_text(f"{materials_digest}  {materials.name}\n", encoding="utf-8")
report = {
    "product": manifest["name"], "version": version,
    "checkedAt": datetime.now(timezone.utc).isoformat(),
    "zip": release.name, "entries": len(expected), "bytes": release.stat().st_size,
    "sha256": digest, "manifestAtRoot": True, "allMembersMatchSources": True,
    "crcValid": True, "publicBrandingClean": True, "iconsValid": True,
    "listingAssets": asset_sizes, "currentPreviewIsStoreScreenshot": False, "materials": materials.name,
    "supportedPanelVersions": supported_versions, "publishedToStore": False,
}
(root / "docs" / "release-checks.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
