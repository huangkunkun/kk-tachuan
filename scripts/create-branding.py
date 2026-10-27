"""Generate the original tower/upload mark and a host-ready privacy page."""
from html import escape
from pathlib import Path
import re

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
PUBLISHING = ROOT / "publishing"
ICONS.mkdir(exist_ok=True)
PUBLISHING.mkdir(exist_ok=True)

SVG = '''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <title>KK塔传</title>
  <g transform="translate(12.8 12.8) scale(.8)">
  <rect x="4" y="4" width="120" height="120" rx="28" fill="#137451"/>
  <path d="M64 49 104 74H86v12h10v12H32V86h10V74H24Z" fill="#F3FFF8"/>
  <path d="M64 19 82 38H71v25H57V38H46Z" fill="#FFD482"/>
  <path d="M57 79h14v19H57Z" fill="#137451"/>
  </g>
</svg>
'''
(PUBLISHING / "icon.svg").write_text(SVG, encoding="utf-8")

# Draw at 8x resolution, then downsample for crisp toolbar sizes.
scale = 8
canvas = Image.new("RGBA", (128 * scale, 128 * scale))
draw = ImageDraw.Draw(canvas)
box = lambda values: tuple(round(v * scale) for v in values)
points = lambda values: [(x * scale, y * scale) for x, y in values]
draw.rounded_rectangle(box((4, 4, 124, 124)), 28 * scale, fill="#137451")
draw.polygon(points([(64,49),(104,74),(86,74),(86,86),(96,86),(96,98),(32,98),(32,86),(42,86),(42,74),(24,74)]), fill="#F3FFF8")
draw.polygon(points([(64,19),(82,38),(71,38),(71,63),(57,63),(57,38),(46,38)]), fill="#FFD482")
draw.rectangle(box((57,79,71,98)), fill="#137451")
for size in (16, 32, 48, 128):
    if size == 128:
        # Store artwork: 96 px square with 16 px transparent padding.
        icon = Image.new("RGBA", (128, 128))
        artwork = canvas.crop(box((4, 4, 124, 124))).resize((96, 96), Image.Resampling.LANCZOS)
        icon.paste(artwork, (16, 16))
    else:
        icon = canvas.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(ICONS / f"icon-{size}.png", optimize=True)

from PIL import ImageFont
promo_scale = 3
promo = Image.new("RGB", (440 * promo_scale, 280 * promo_scale), "#105A41")
pd = ImageDraw.Draw(promo)
pd.rounded_rectangle((265*promo_scale, -46*promo_scale, 540*promo_scale, 320*promo_scale), 110*promo_scale, fill="#176C4D")
pd.line((32*promo_scale, 216*promo_scale, 225*promo_scale, 216*promo_scale), fill="#3A8A68", width=promo_scale)
font_path = Path("C:/Windows/Fonts/msyh.ttc")
font_bold = Path("C:/Windows/Fonts/msyhbd.ttc")
pd.text((32*promo_scale, 66*promo_scale), "KK塔传", fill="#F3FFF8", font=ImageFont.truetype(str(font_bold), 43*promo_scale))
pd.text((34*promo_scale, 133*promo_scale), "KK宝塔文件上传助手", fill="#D8ECE0", font=ImageFont.truetype(str(font_path), 17*promo_scale))
pd.text((34*promo_scale, 180*promo_scale), "打包上传 / 逐个上传", fill="#FFD482", font=ImageFont.truetype(str(font_path), 14*promo_scale))
mark = canvas.resize((144*promo_scale, 144*promo_scale), Image.Resampling.LANCZOS)
promo.paste(mark, (272*promo_scale, 68*promo_scale), mark)
promo.resize((440, 280), Image.Resampling.LANCZOS).save(PUBLISHING / "promo-440x280.png", optimize=True)

def inline(text):
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", escape(text).replace("**", ""))

sections, paragraph, in_list = [], [], False
def flush():
    if paragraph:
        sections.append("<p>" + "<br>".join(inline(s) for s in paragraph) + "</p>")
        paragraph.clear()

for raw in (ROOT / "PRIVACY.md").read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line:
        flush()
        if in_list:
            sections.append("</ul>")
            in_list = False
    elif line.startswith("#"):
        flush()
        level = min(len(line) - len(line.lstrip("#")), 2)
        sections.append(f"<h{level}>" + inline(line.lstrip("# ")) + f"</h{level}>")
    elif line.startswith("- "):
        flush()
        if not in_list:
            sections.append("<ul>")
            in_list = True
        sections.append("<li>" + inline(line[2:]) + "</li>")
    else:
        paragraph.append(line)
flush()
if in_list:
    sections.append("</ul>")
page = '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>KK塔传隐私政策</title><style>
body{margin:0;background:#fafbf9;color:#253e33;font:16px/1.85 system-ui,"Microsoft YaHei",sans-serif}
main{max-width:800px;margin:48px auto;padding:0 24px 48px}h1{font-size:30px;line-height:1.4;color:#137451}h2{font-size:21px;margin-top:32px}p{margin:16px 0}code{font-size:.9em;background:#edf3ee;padding:2px 5px;border-radius:4px}li{margin:8px 0}
</style></head><body><main>''' + "\n".join(sections) + "</main></body></html>\n"
(PUBLISHING / "privacy.html").write_text(page, encoding="utf-8")
print("Created icons, SVG master, promotional image and privacy HTML")
