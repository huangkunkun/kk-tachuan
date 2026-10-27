"""Read official BaoTa update archives and compare the interfaces used by KK塔传.

Downloads are inspected as ZIP data only; nothing from the archives is executed.
"""
import ast
import hashlib
import io
import json
import re
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen

BASE = Path(__file__).resolve().parent.parent
VERSIONS = sys.argv[1:] or ["9.5.0", "11.1.0", "11.2.0", "11.4.0", "11.4.1", "11.5.0", "11.8.0", "11.8.1", "13.0.0", "13.1.0"]
METHODS = ("GetDirNew", "CreateDir", "upload", "upload_files_exists", "UnZip", "DeleteDir")


class StripDocstrings(ast.NodeTransformer):
    def visit_FunctionDef(self, node):
        self.generic_visit(node)
        if node.body and isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Constant) and isinstance(node.body[0].value.value, str):
            node.body.pop(0)
        return node


def fingerprint(node):
    stripped = StripDocstrings().visit(node)
    return hashlib.sha256(ast.dump(stripped, include_attributes=False).encode()).hexdigest()


reference_path = BASE / "docs/reference/LinuxPanel-11.3.0.zip"
if reference_path.exists():
    reference_bytes = reference_path.read_bytes()
else:
    # The official archive is intentionally not committed to the repository.
    reference_url = "https://download.bt.cn/install/update/LinuxPanel-11.3.0.zip"
    with urlopen(Request(reference_url, headers={"User-Agent": "KK-Tachuan-Compatibility-Audit/1.0"}), timeout=120) as response:
        reference_bytes = response.read()
reference_hash = "16d043ed0eb446079eb7a8cc6426fb86b486ccfbcf82a6318fae72c57e818c55"
if hashlib.sha256(reference_bytes).hexdigest() != reference_hash:
    raise ValueError("Official 11.3.0 reference archive does not match the recorded SHA-256; review it before auditing.")
with zipfile.ZipFile(io.BytesIO(reference_bytes)) as reference:
    baseline_tree = ast.parse(reference.read("panel/class/files.py").decode("utf-8-sig"))
baseline_class = max((node for node in baseline_tree.body if isinstance(node, ast.ClassDef)), key=lambda node: sum(isinstance(n, ast.FunctionDef) and n.name in METHODS for n in node.body))
baseline = {node.name: fingerprint(node) for node in baseline_class.body if isinstance(node, ast.FunctionDef) and node.name in METHODS}


def audit(version):
    url = f"https://download.bt.cn/install/update/LinuxPanel-{version}.zip"
    try:
        with urlopen(Request(url, headers={"User-Agent": "KK-Tachuan-Compatibility-Audit/1.0"}), timeout=120) as response:
            data = response.read()
        archive = zipfile.ZipFile(io.BytesIO(data))
        names = archive.namelist()
        files_path = next(n for n in names if n.rstrip("/").endswith("/class/files.py"))
        source = archive.read(files_path).decode("utf-8-sig")
        tree = ast.parse(source)
        classes = [n for n in tree.body if isinstance(n, ast.ClassDef)]
        owner = max(classes, key=lambda c: sum(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in METHODS for n in c.body))
        methods = {n.name: n for n in owner.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in METHODS}
        comparisons = {name: {"present": name in methods, "matches117": name in methods and fingerprint(methods[name]) == baseline[name]} for name in METHODS}
        hits = {s: [] for s in ("FILES-STORE", "fileTabActiveData", "vite_public_version", "vite_public_request_token", "#request_token_head")}
        templates = []
        for name in names:
            if not name.startswith("panel/BTPanel/") or not name.endswith((".js", ".html")):
                continue
            if archive.getinfo(name).file_size > 15_000_000:
                continue
            raw = archive.read(name)
            for symbol in hits:
                if symbol.encode() in raw:
                    hits[symbol].append(name)
            if name.endswith("templates/default/index.html"):
                text = raw.decode("utf-8", errors="replace")
                mounts = re.findall(r'id\s*=\s*(?:["\'](app|root)["\']|(app|root)(?=[\s>]))', text)
                templates.append({"path": name, "mountIds": sorted({a or b for a, b in mounts}), "versionToken": "vite_public_version" in text, "requestToken": "vite_public_request_token" in text})
        return {"version": version, "url": url, "sha256": hashlib.sha256(data).hexdigest(), "archiveBytes": len(data), "filesPath": files_path, "class": owner.name, "methods": comparisons, "frontend": {k: {"count": len(v), "sample": v[:3]} for k, v in hits.items()}, "templates": templates}
    except Exception as error:
        return {"version": version, "url": url, "error": f"{type(error).__name__}: {error}"}


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(audit, VERSIONS))
    out = BASE / "docs/reference/version-audit.json"
    previous = json.loads(out.read_text(encoding="utf-8"))["results"] if out.exists() else []
    by_version = {result["version"]: result for result in previous}
    by_version.update({result["version"]: result for result in results})
    combined = sorted(by_version.values(), key=lambda result: tuple(map(int, result["version"].split("."))))
    out.write_text(json.dumps({"baseline": "11.3.0 (the six compared methods match the 11.7.0 reference)", "method": "Python AST with docstrings removed; static frontend symbol search", "results": combined}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for result in results:
        if "error" in result:
            print(result["version"], result["error"], flush=True)
        else:
            print(result["version"], "matches", sum(v["matches117"] for v in result["methods"].values()), "/6", "frontend", {k: v["count"] for k, v in result["frontend"].items()}, "templates", result["templates"], flush=True)
