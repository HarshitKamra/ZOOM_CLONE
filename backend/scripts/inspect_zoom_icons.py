"""Save the Zoom Web App's icons and the home HTML tree.

Reads the public client at https://app.zoom.us/wc/home (no sign-in).
Icons live in the PWA bundles as inline SVGs. The signed-in home is rendered
by that same script, so the tree is rebuilt from its createElement calls.

    python backend/scripts/inspect_zoom_icons.py
"""

from __future__ import annotations

import json
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

HOME_URL = "https://app.zoom.us/wc/home?from=pwa"
ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "backend" / "data" / "zoom_pwa"
OUT = ROOT / "frontend" / "public" / "zoom-icons"

# Export names used by the home screen in web client 7.2.
ALIASES = {
    "qyX": "video-on",
    "o1S": "video-off",
    "xhT": "join",
    "bWN": "return-meeting",
}


def fetch(url: str, dest: Path) -> bytes:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return dest.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": "zoom-clone-icon-inspect"})
    data = urllib.request.urlopen(req, timeout=60).read()
    dest.write_bytes(data)
    return data


def cdn_version(html: str) -> str:
    match = re.search(r'config\.cdnPath = "([^"]+)"', html)
    if not match:
        raise SystemExit("Zoom page did not include a client bundle path")
    return match.group(1)


def slice_module(js: str, module_id: str) -> str:
    start = js.find(f"{module_id}(e,t,n){{")
    if start < 0:
        raise SystemExit(f"module {module_id} not in vendors bundle")
    rest = js[start + 20 :]
    nxt = re.search(r"\},(\d+)\(e,t,n\)\{", rest)
    end = start + 20 + (nxt.start() if nxt else len(rest))
    return js[start:end]


def matching_paren(src: str, open_at: int) -> int:
    depth = 0
    for i in range(open_at, len(src)):
        char = src[i]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return i + 1
    return len(src)


def svg_markup(blob: str, view_box: str) -> str:
    paths = re.findall(r'\{d:"([^"]+)"', blob)
    if not paths:
        paths = re.findall(r'd:"([^"]+)"', blob)
    body = []
    for path in paths:
        body.append(f'<path fill="currentColor" d="{path}"/>')
    rects = re.findall(r'createElement\("rect",\{([^}]*)\}', blob)
    for rect in rects:
        if "white" in rect:
            continue
        width = re.search(r'width:"?(\d+)', rect)
        if width and int(width.group(1)) >= 24:
            continue
        attrs = " ".join(f'{k}="{v}"' for k, v in re.findall(r'([a-zA-Z]+)\:"([^"]*)"', rect))
        if attrs:
            body.append(f'<rect fill="currentColor" {attrs}/>')
    if not body:
        return ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" fill="none">'
        + "".join(body)
        + "</svg>"
    )


def svg_at(src: str, index: int) -> str:
    j = src.find('createElement("svg"', index)
    if j < 0 or j - index > 2500:
        return ""
    call_end = matching_paren(src, src.find("(", j))
    blob = src[j:call_end]
    view = re.search(r'viewBox:"([^"]+)"', blob)
    return svg_markup(blob, view.group(1) if view else "0 0 24 24")


def label_at(src: str, index: int) -> str:
    window = src[index : index + 500]
    match = re.search(r'aria-label":"([^"]+)"', window)
    return match.group(1) if match else ""


def resolve_local(module: str, local: str) -> int:
    seen: set[str] = set()
    while local not in seen:
        seen.add(local)
        direct = re.search(
            rf"(?<![\w$]){re.escape(local)}=8792==n\.j\?r\.forwardRef",
            module,
        )
        if direct:
            return direct.start()
        alias = re.search(
            rf"(?<![\w$]){re.escape(local)}=8792==n\.j\?([A-Za-z0-9_$]+):null",
            module,
        )
        if not alias:
            return -1
        local = alias.group(1)
    return -1


def export_names(module: str) -> dict[str, str]:
    header = re.search(r"n\.d\(t,\{(.*?)\}\)", module)
    if not header:
        return {}
    return dict(re.findall(r"([A-Za-z0-9_$]+):\(\)=>([A-Za-z0-9_$]+)", header.group(1)))


def safe_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-").lower()
    return cleaned[:80] or "icon"


def home_tree(main_js: str) -> str:
    marker = 'className:"standard-main-wrapper"'
    at = main_js.find(marker)
    if at < 0:
        return "<p>Home render was not found in this bundle.</p>"
    start = main_js.rfind("createElement(", at - 80, at)
    end = matching_paren(main_js, main_js.find("(", start))
    region_end = min(end, start + 40000)
    lines = ["<!-- Rebuilt from the Zoom Web App home render -->", "<main>"]

    def walk(src: str, begin: int, end: int, depth: int, budget: list[int]) -> int:
        i = begin
        while i < end and budget[0] > 0:
            j = src.find("createElement(", i)
            if j < 0 or j >= end:
                break
            call_end = matching_paren(src, src.find("(", j))
            if call_end > end + 50 and depth > 0:
                break
            head = src[j : j + 280]
            tag_m = re.match(r'createElement\("([^"]+)"', head)
            tag = tag_m.group(1) if tag_m else "div"
            cls = ""
            quoted = re.search(r'className:"([^"]*)"', head)
            joined = re.search(r'me\(\)\("([^"]+)"', head)
            if quoted:
                cls = quoted.group(1)
            elif joined:
                cls = joined.group(1)
            pad = "  " * (depth + 1)
            attr = f' class="{cls}"' if cls else ""
            lines.append(f"{pad}<{tag}{attr}>")
            budget[0] -= 1
            walk(src, j + 14, min(call_end, end), depth + 1, budget)
            lines.append(f"{pad}</{tag}>")
            i = call_end
        return i

    walk(main_js, start, region_end, 0, [400])
    lines.append("</main>")
    return "\n".join(lines)


class Outline(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.depth = 0
        self.lines: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self.skip += 1
            return
        if self.skip:
            return
        info = dict(attrs)
        extra = ""
        if info.get("id"):
            extra += f"#{info['id']}"
        if info.get("class"):
            extra += "." + ".".join(str(info["class"]).split())
        self.lines.append("  " * self.depth + f"<{tag}{extra}>")
        if tag not in {"img", "input", "meta", "link", "br"}:
            self.depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self.skip:
            self.skip -= 1
            return
        if self.skip or tag in {"img", "input", "meta", "link", "br"}:
            return
        self.depth = max(0, self.depth - 1)


def main() -> None:
    html = fetch(HOME_URL, CACHE / "home.html").decode("utf-8", "ignore")
    base = cdn_version(html)
    vendors = fetch(f"{base}/js/vendors.js", CACHE / "vendors.js").decode("utf-8", "ignore")
    main_js = fetch(f"{base}/js/main.js", CACHE / "main.js").decode("utf-8", "ignore")
    css = fetch(f"{base}/css/main.css", CACHE / "main.css").decode("utf-8", "ignore")

    module = slice_module(vendors, "31323")
    exports = export_names(module)
    icons: dict[str, str] = {}
    by_export: dict[str, str] = {}

    for export, local in exports.items():
        at = resolve_local(module, local)
        if at < 0:
            continue
        markup = svg_at(module, at)
        if not markup:
            continue
        label = label_at(module, at) or export
        file_name = safe_name(label)
        if file_name in icons:
            file_name = f"{file_name}-{safe_name(export)}"
        icons[file_name] = markup
        by_export[export] = file_name

    schedule = main_js.find('createElement("svg",{width:"36",height:"39"')
    if schedule > 0:
        markup = svg_at(main_js, max(0, schedule - 40))
        if markup:
            icons["schedule"] = markup
            by_export["schedule"] = "schedule"

    for export, alias in ALIASES.items():
        if export in by_export:
            icons[alias] = icons[by_export[export]]

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.svg"):
        old.unlink()
    for name, markup in icons.items():
        (OUT / f"{name}.svg").write_text(markup, encoding="utf-8")

    outline = Outline()
    outline.feed(html)
    tree = (
        "<!doctype html><meta charset=\"utf-8\"><title>Zoom home tree</title><pre>\n"
        + "\n".join(outline.lines[:400])
        + "\n\n"
        + home_tree(main_js)
        + "\n</pre>"
    )
    (OUT / "home-tree.html").write_text(tree, encoding="utf-8")
    manifest = {
        "source": HOME_URL,
        "bundle": base,
        "count": len(icons),
        "aliases": {alias: by_export[export] for export, alias in ALIASES.items() if export in by_export},
        "exports": by_export,
        "files": sorted(icons),
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {len(icons)} icons to {OUT}")
    print("aliases", ", ".join(sorted(manifest["aliases"])))


if __name__ == "__main__":
    main()
