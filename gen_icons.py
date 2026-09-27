"""アイコン生成用の使い捨てスクリプト（アイコン生成後は削除して構わない）。
VST版(RackTheme.cpp)のダークパレット(background/amber)を踏襲した配色。
"""
from PIL import Image, ImageDraw
from pathlib import Path

HERE = Path(__file__).parent
ICONS_DIR = HERE / "icons"
ICONS_DIR.mkdir(exist_ok=True)

BG = (10, 14, 22, 255)      # RackTheme darkPalette.background (#0A0E16)
AMBER = (255, 167, 38, 255)  # RackTheme darkPalette.amber (#FFA726)
WHITE = (237, 239, 242, 255)  # RackTheme darkPalette.textPrimary


def draw_icon(size, padding_ratio=0.0):
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    pad = int(size * padding_ratio)
    inner = size - pad * 2

    # 中央にラウドネスメーターのセグメントバーを模した意匠
    bar_count = 5
    gap = inner * 0.06
    bar_w = (inner - gap * (bar_count - 1)) / bar_count
    heights = [0.32, 0.5, 0.78, 0.56, 0.4]
    base_y = pad + inner * 0.82
    start_x = pad + inner * 0.09

    for i, h in enumerate(heights):
        x0 = start_x + i * (bar_w + gap)
        y0 = base_y - inner * h
        x1 = x0 + bar_w
        y1 = base_y
        color = AMBER if i != 2 else WHITE
        radius = bar_w * 0.3
        draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=color)

    return img


def save_svg():
    bars = ""
    heights = [0.32, 0.5, 0.78, 0.56, 0.4]
    bar_w = 60
    gap = 30
    start_x = 60
    base_y = 420
    for i, h in enumerate(heights):
        x = start_x + i * (bar_w + gap)
        height = 340 * h
        y = base_y - height
        fill = f"rgb{WHITE[:3]}" if i == 2 else f"rgb{AMBER[:3]}"
        bars += f'<rect x="{x}" y="{y}" width="{bar_w}" height="{height}" rx="18" fill="{fill}"/>\n  '

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="rgb{BG[:3]}"/>
  {bars}</svg>"""
    (ICONS_DIR / "icon.svg").write_text(svg, encoding="utf-8")


save_svg()
draw_icon(192).save(ICONS_DIR / "icon-192.png")
draw_icon(512).save(ICONS_DIR / "icon-512.png")
draw_icon(512, padding_ratio=0.1).save(ICONS_DIR / "icon-maskable-512.png")
print("icons generated")
