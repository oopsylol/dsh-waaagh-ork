#!/usr/bin/env python3
"""Builds the mascot sprites (`src/assets/ork-idle.png`, `ork-shout.png`).

The Ork is drawn by Volcano Ark's `doubao-seedream-4-0` image model rather than
by hand: the hand-drawn version in `scripts/sprite.mjs` kept losing the likeness
at mascot size, and the model keeps one character consistent across poses when
each frame is generated with the first frame as a reference image.

    export ARK_API_KEY=...            # or set it in the user environment
    python scripts/mascot.py          # generate the five frames, then build strips

    python scripts/mascot.py --raw <dir>   # rebuild the strips from saved frames

Frames are drawn on a flat magenta background (the model honours that reliably),
keyed out here by hue, cropped, fitted to one 128x160 frame and quantised. The
strips are what the plugin ships; `--raw` re-derives them without spending API
tokens, which is also how CI stays offline.

Requires Pillow (bundled with the DSH runtimes) and network access to Ark.
"""
import argparse
import base64
import colorsys
import json
import mimetypes
import os
import pathlib
import sys
import urllib.error
import urllib.request

from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "src" / "assets"
FRAME_W, FRAME_H = 128, 160
PALETTE_COLORS = 64

BASE = os.environ.get("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
MODEL = os.environ.get("VOLC_IMAGE_MODEL", "doubao-seedream-4-0-250828")

# The character sheet every prompt repeats. The brief is "cute and daft": an Ork
# WAAAGH is a silly yell, not a berserker rage, so the eyes are big and googly
# (never angry red slits), the proportions are chibi and the details are goofy.
STYLE = (
    "严格保持参考图中这个角色的设计：亮绿色皮肤、粗黑描边、16-bit 像素风、大大的白色圆眼睛配黑色大眼珠"
    "（呆萌，不要红眼、不要凶狠）、三头身、又大又圆的脑袋、圆滚滚的小肚子、小短手小短腿、大靴子、"
    "一撮歪掉的呆毛、脸颊贴着一块创可贴、缺一颗牙、小小的圆护肩上只有一根歪掉的小尖刺、"
    "手里一把看起来很钝的小砍刀。整体构图：全身、正面、居中、纯色品红背景（#CC1166），"
    "背景必须干净无阴影（阴影也必须是同一品红色）、无地面、无文字。"
)
# While a turn runs he paddles laps around the composer bubble, so these frames
# keep the same character but put him up to his waist in water.
SWIM = (
    "16-bit 像素风，同一个可爱的兽人小子，现在正在水里游泳：只有上半身和脑袋露出水面，"
    "身体周围有一圈白色水花和波纹（水花也必须是像素风格），"
    "两只小短手像划水一样一上一下地划，嘴巴张着傻叫、表情开心，"
    "粗黑描边、平涂色块、纯色品红背景（#CC1166），居中，无文字。"
)
# …and when the turn drags he goes under.
DROWN = (
    "16-bit 像素风，同一个可爱的兽人小子，现在快要溺水了：水面没过身体，"
    "他举着两只小短手在水面扑腾，眼睛变成晕眩的圈圈、嘴巴张着吐气泡，一串小气泡往上冒，"
    "表情又傻又慌（可爱而不是恐怖），像素风格的水花与波纹，"
    "粗黑描边、平涂色块、纯色品红背景（#CC1166），居中，无文字。"
)
PROMPTS = {
    # --- shout set A: waving both arms and hopping (the first set, kept as base)
    "shout-a2": (
        "16-bit 像素风游戏精灵图，一只超可爱、傻乎乎的卡通兽人小子（Warhammer 40k greenskin），三头身大头，"
        "正在开心地大喊大叫：嘴巴张得很大像小朋友在傻叫，舌头伸出来，嘴里两颗小獠牙，"
        "两只超大的白眼睛配黑色大眼珠、其中一只眼珠歪向另一边（斗鸡眼），圆滚滚的小肚子，"
        "一撮歪掉的呆毛，脸颊贴着创可贴，缺一颗牙，小短手小短腿和大靴子，"
        "粗黑描边、平涂色块、无抗锯齿，居中，处于纯色品红背景上，表情是兴奋开心而不是愤怒"
    ),
    "shout-a1": STYLE + "姿势改为：两只小短手举起来挥舞，身体开心地向后仰，嘴巴张到最大在傻叫，舌头伸出来，"
    "眼睛睁得大大的、眼珠还是歪的，像在兴奋地喊口号。",
    "shout-a3": STYLE + "姿势改为：双拳举过头顶、双脚离地小跳一下，嘴巴张到最大傻叫，舌头伸出来，"
    "眼睛亮晶晶地往上看着，一副开心到不行的样子。",
    "shout-a4": STYLE + "姿势改为：两只小短手向身体两侧张开、掌心朝前，脑袋歪向一边，嘴巴张大傻叫，舌头伸出来。",
    "shout-a5": STYLE + "姿势改为：身体扭向一侧、一只脚抬起来像在蹦跶，两只手一只高一只低地乱挥，"
    "眼睛笑成一条线，开心得不行。",
    # --- shout set B: flailing the blunt little choppa around
    "shout-b1": STYLE + "姿势改为：双手把小砍刀举过头顶正要往下挥，身体向后仰，嘴巴张大傻叫，舌头伸出来。",
    "shout-b2": STYLE + "姿势改为：小砍刀挥到身体正前方，身体跟着向前弯，一只脚抬起来，嘴巴张得大大的傻叫。",
    "shout-b3": STYLE + "姿势改为：小砍刀甩到身体另一侧，人被自己带得歪向一边，眼睛笑成一条线，舌头伸出来。",
    "shout-b4": STYLE + "姿势改为：小砍刀垂在身体前面快要碰到地面，人被惯性带着弯下腰，嘴巴张得大大的傻叫。",
    "shout-b5": STYLE + "姿势改为：小砍刀甩到肩膀后面，身体跟着转向另一边，眼睛笑成一条线，舌头伸出来。",
    # --- shout set C: dakka. Chained c2/c3 off c1, not off the base: referenced to
    # the unarmed base the model kept inventing a different weapon for each frame.
    "shout-c1": STYLE + "姿势改为：双手端着一把又小又简陋的哒哒枪往前乱开火（枪口喷出小小的火花），"
    "后坐力把他顶得往后仰，嘴巴张到最大傻叫，舌头伸出来。手里拿的必须是枪，不要盾牌、不要大刀。",
    "shout-c2": STYLE + "继续用参考图里的那把枪，姿势改为：一边开火一边被后坐力顶得双脚离地往后跳，"
    "闭起一只眼睛瞄准，嘴巴咧开傻笑。",
    "shout-c3": STYLE + "继续用参考图里的那把枪，姿势改为：把小枪举到头顶乱射，开心得眼睛弯成弧线，"
    "嘴巴张到最大傻叫，舌头伸出来。",
    "shout-c4": STYLE + "继续用参考图里的那把枪，姿势改为：一只手把还在冒烟的小枪举高，另一只手给自己扇风，"
    "眯起一只眼睛傻笑。",
    "shout-c5": STYLE + "继续用参考图里的那把枪，姿势改为：两只手一上一下地端着枪乱扫，身体被后坐力推得歪向一边，"
    "嘴巴张到最大傻叫，舌头伸出来。",
    # --- swim set: paddling laps around the composer bubble while the model works
    "swim1": SWIM + "姿势：左手抬高划水、右手往下压，身体微微侧过来，水花在两边炸开。",
    "swim2": SWIM + "姿势：两只手一起向前划，水花最大，脑袋往前探，嘴巴张到最大傻叫。",
    "swim3": SWIM + "姿势：右手抬高划水、左手往下压，和参考图方向相反，身体微微侧过来。",
    "swim4": SWIM + "姿势：两只手一起向后划，身体前倾，水花都在身后，舌头伸出来。",
    "swim5": SWIM + "姿势：换气——脑袋高高抬出水面，两只手在水面下划，身体上下起伏，眼睛笑成弧线。",
    # --- drown set: he sinks when the turn drags, then comes back up
    "drown1": DROWN + "水位：没到胸口，嘴巴张着吐出一串气泡，两只手在水面乱拍。",
    "drown2": DROWN + "水位：没到下巴，眼睛变成晕眩的圈圈，气泡一串一串往上冒。",
    "drown3": DROWN + "水位：只剩头顶和一撮呆毛露在外面，两只手在水面上扑腾。",
    "drown4": DROWN + "水位：整个人沉下去了，水面上只剩几个气泡和一只举着的小手。",
    # --- idle set A: standing, scratching his head. Three frames: open, half
    # shut, shut, so the blink is a roll rather than a flicker.
    "idle-a1": STYLE + "姿势改为：站在原地挠着后脑勺傻笑，另一只手扶着插在地上的小砍刀，嘴巴咧开露出两颗小獠牙，"
    "眼睛半眯着显得又懒又傻，整个人是“等着被派活、脑子空空的”样子。",
    "idle-a2": "严格保持参考图中这个角色的设计、姿势、构图和纯色品红背景，一点都不要改动，只改一处："
    "把眼睛闭到一半（眼皮盖住眼珠的下半部分，正在眨眼的中途），不要动其它任何地方。",
    "idle-a3": "严格保持参考图中这个角色的设计、姿势、构图和纯色品红背景，一点都不要改动，只改一处："
    "把眼睛完全闭上，闭成两条向下的黑线（正在眨眼），不要动其它任何地方。",
    # --- idle set B: sitting on the ground
    "idle-b1": STYLE + "姿势改为：一屁股坐在地上，两条小短腿往前伸直，一只手撑地、另一只手挠着圆肚子，"
    "脑袋歪向一边傻笑，眼睛又大又圆、一只眼珠歪向旁边，一副无所事事的呆样。",
    "idle-b2": "严格保持参考图中这个角色的设计、姿势、构图和纯色品红背景，一点都不要改动，只改一处："
    "把眼睛闭到一半（眼皮盖住眼珠的下半部分，正在眨眼的中途），不要动其它任何地方。",
    "idle-b3": "严格保持参考图中这个角色的设计、姿势、构图和纯色品红背景，一点都不要改动，只改一处："
    "把眼睛完全闭上，闭成两条向下的黑线（正在眨眼），不要动其它任何地方。",
}
# Shout frames are generated first so every later frame can reference one settled
# design; within a set the frames hang off the set's own first frame, because the
# unarmed base made the model invent a different prop for every pose.
REFERENCES = {
    "shout-a2": None,
    "shout-a1": "shout-a2",
    "shout-a3": "shout-a2",
    "shout-a4": "shout-a1",
    "shout-a5": "shout-a3",
    "shout-b1": "shout-a2",
    "shout-b2": "shout-a2",
    "shout-b3": "shout-a2",
    "shout-b4": "shout-b1",
    "shout-b5": "shout-b3",
    "shout-c1": "shout-a2",
    "shout-c2": "shout-c1",
    "shout-c3": "shout-c1",
    "shout-c4": "shout-c3",
    "shout-c5": "shout-c2",
    "idle-a1": "shout-a2",
    "idle-a2": "idle-a1",
    "idle-a3": "idle-a1",
    "idle-b1": "shout-a2",
    "idle-b2": "idle-b1",
    "idle-b3": "idle-b1",
    "swim1": "shout-a2",
    "swim2": "swim1",
    "swim3": "swim1",
    "swim4": "swim2",
    "swim5": "swim2",
    "drown1": "shout-a2",
    "drown2": "drown1",
    "drown3": "drown2",
    "drown4": "drown3",
}
# Idle strips are three frames (open, half shut, shut), shout and swim strips are
# five, the drown strip is four, so each state walks its frames with one CSS
# animation and only the image changes between sets.
STRIPS = {
    "ork-idle-a.png": ["idle-a1", "idle-a2", "idle-a3"],
    "ork-idle-b.png": ["idle-b1", "idle-b2", "idle-b3"],
    "ork-shout-a.png": ["shout-a1", "shout-a2", "shout-a3", "shout-a4", "shout-a5"],
    "ork-shout-b.png": ["shout-b1", "shout-b2", "shout-b3", "shout-b4", "shout-b5"],
    "ork-shout-c.png": ["shout-c1", "shout-c2", "shout-c3", "shout-c4", "shout-c5"],
    "ork-swim.png": ["swim1", "swim2", "swim3", "swim4", "swim5"],
    "ork-drown.png": ["drown1", "drown2", "drown3", "drown4"]
}


def request_frame(prompt: str, reference: pathlib.Path | None, out: pathlib.Path) -> None:
    """Generate one frame through Ark and write the raw image to `out`."""
    key = os.environ.get("ARK_API_KEY")
    if not key:
        raise SystemExit("ARK_API_KEY is not set (see the module docstring)")
    payload = {"model": MODEL, "prompt": prompt, "size": "1024x1024", "response_format": "url", "watermark": False}
    if reference is not None:
        mime = mimetypes.guess_type(reference)[0] or "image/png"
        payload["image"] = f"data:{mime};base64,{base64.b64encode(reference.read_bytes()).decode('ascii')}"
    request = urllib.request.Request(
        f"{BASE}/images/generations",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Ark HTTP {error.code}: {error.read().decode('utf-8', 'replace')[:400]}")
    items = result.get("data") or []
    if not items or not items[0].get("url"):
        raise SystemExit(f"unexpected Ark response: {json.dumps(result)[:300]}")
    with urllib.request.urlopen(items[0]["url"], timeout=240) as response:
        out.write_bytes(response.read())
    print(f"  generated {out.name} ({result.get('usage', {}).get('generated_images', 1)} image)")


def key_magenta(image: Image.Image) -> Image.Image:
    """Replace the flat magenta backdrop (and its shadow) with transparency.

    Keyed on hue rather than a single sampled colour: the model renders a magenta
    drop shadow under the boots, and a distance key leaves that as a pink smear.
    """
    image = image.convert("RGB")
    width, height = image.size
    source = image.load()
    out = Image.new("RGBA", (width, height))
    target = out.load()
    for y in range(height):
        for x in range(width):
            r, g, b = source[x, y]
            hue, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            magenta = 0.80 <= hue <= 0.98
            if magenta and sat > 0.35:
                target[x, y] = (0, 0, 0, 0)
            elif magenta and sat > 0.12:
                # Soft edge: fade out and pull the pink cast back toward the skin.
                alpha = int(max(0.0, min(1.0, (0.35 - sat) / 0.23)) * 255)
                target[x, y] = (min(r, g + 30), g, min(b, g + 30), alpha)
            else:
                target[x, y] = (r, g, b, 255)
    return out


def drop_speckles(image: Image.Image) -> Image.Image:
    """Remove detached specks left over from keying.

    The model sometimes leaves a stray blob (a sweat drop, a chip of the previous
    pose). Besides looking wrong it inflates the alpha bounding box, so the
    character gets scaled down and pushed off centre. Components are found on a
    reduced copy and anything outside the main body is cut.
    """
    alpha = image.getchannel("A")
    small_w, small_h = 256, 256
    binary = alpha.resize((small_w, small_h), Image.BILINEAR).point(lambda v: 255 if v > 40 else 0)
    mask = binary.load()
    seen = bytearray(small_w * small_h)
    components: list[list[tuple[int, int]]] = []
    for start_y in range(small_h):
        for start_x in range(small_w):
            index = start_y * small_w + start_x
            if seen[index] or mask[start_x, start_y] == 0:
                continue
            queue = [(start_x, start_y)]
            seen[index] = 1
            blob: list[tuple[int, int]] = []
            while queue:
                x, y = queue.pop()
                blob.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1), (x + 2, y), (x - 2, y), (x, y + 2), (x, y - 2)):
                    if 0 <= nx < small_w and 0 <= ny < small_h:
                        neighbour = ny * small_w + nx
                        if not seen[neighbour] and mask[nx, ny] > 0:
                            seen[neighbour] = 1
                            queue.append((nx, ny))
            components.append(blob)
    if not components:
        return image
    largest = max(len(blob) for blob in components)
    keep = Image.new("L", (small_w, small_h), 0)
    keep_pixels = keep.load()
    for blob in components:
        if len(blob) < largest * 0.12:
            continue
        for x, y in blob:
            keep_pixels[x, y] = 255
    keep = keep.resize(image.size, Image.NEAREST).filter(ImageFilter.MaxFilter(3))
    out = image.copy()
    out.putalpha(Image.composite(image.getchannel("A"), Image.new("L", image.size, 0), keep))
    return out


def fit_frame(image: Image.Image) -> Image.Image:
    """Crop to the character, fit one 128x160 frame and quantise."""
    image = drop_speckles(image)
    box = image.getbbox()
    if box is None:
        raise SystemExit("frame is empty after keying")
    character = image.crop(box)
    scale = min((FRAME_W - 2) / character.width, (FRAME_H - 2) / character.height)
    size = (max(1, round(character.width * scale)), max(1, round(character.height * scale)))
    character = character.resize(size, Image.LANCZOS)
    frame = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    frame.paste(character, ((FRAME_W - size[0]) // 2, (FRAME_H - size[1]) // 2))
    return frame.quantize(colors=PALETTE_COLORS, method=Image.FASTOCTREE)


def build_strips(raw: pathlib.Path) -> None:
    for name, frames in STRIPS.items():
        strip = Image.new("RGBA", (FRAME_W, FRAME_H * len(frames)), (0, 0, 0, 0))
        for index, frame_name in enumerate(frames):
            source = raw / f"{frame_name}.png"
            if not source.exists():
                raise SystemExit(f"missing raw frame: {source}")
            strip.paste(fit_frame(key_magenta(Image.open(source))), (0, index * FRAME_H))
        target = ASSETS / name
        strip.save(target, optimize=True)
        print(f"{target.relative_to(ROOT)}: {strip.width}x{strip.height}, {len(frames)} frames, {target.stat().st_size} bytes")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=pathlib.Path, help="directory of saved raw frames (skips generation)")
    parser.add_argument("--only", action="append", help="generate just these frames (repeatable)")
    args = parser.parse_args()

    default_raw = pathlib.Path(os.environ.get("TEMP", "/tmp")) / "waaagh-mascot-raw"
    raw = args.raw or default_raw
    raw.mkdir(parents=True, exist_ok=True)

    if not args.only and not args.raw:
        print(f"generating {len(PROMPTS)} frames with {MODEL}")
        for name, prompt in PROMPTS.items():
            reference = REFERENCES.get(name)
            request_frame(prompt, raw / f"{reference}.png" if reference else None, raw / f"{name}.png")
    elif args.only:
        for name in args.only:
            reference = REFERENCES.get(name)
            request_frame(PROMPTS[name], raw / f"{reference}.png" if reference else None, raw / f"{name}.png")

    build_strips(raw)


if __name__ == "__main__":
    sys.exit(main())
