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
PALETTE_COLORS = 24

BASE = os.environ.get("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
MODEL = os.environ.get("VOLC_IMAGE_MODEL", "doubao-seedream-4-0-250828")

# Art direction. The mascot is drawn in the ink line-art style of the reference the
# user picked: thick hand-drawn outlines with a little wobble, mostly bare paper,
# one flat wash of colour at most, and the eyes drawn huge with tiny pupils. Each
# prompt repeats the whole sheet, which is what keeps 30 frames looking like one
# character in one style.
LINE = (
    "画风：粗黑的手绘线条（线条有粗细变化、略微抖动，像马克笔速写），几乎不上色、大量留白，"
    "只上极少的平涂色块，不画阴影、不画渐变、不做厚涂、不是像素风；"
    "眼睛画得特别大又圆、瞳孔是很小的黑点，表情呆萌可爱。"
)
CHARACTER = (
    "角色：一只**兽人小子**（Warhammer 40k greenskin）——**兽人特征要非常明显**，绝对不要像人类小孩："
    "脑袋又大又方，**下颚极宽、明显向前突出**，嘴巴很宽；"
    "**两颗又大又粗的獠牙从下颚两侧向上翘出嘴外**，獠牙比嘴巴还高、又长又尖还带弧度，"
    "嘴角另外露出一排方牙；**眉毛又粗又浓、狠狠压低到眼睛上方、眉尾向中间下斜**，一脸凶相；"
    "眼睛又大又圆（眼白大、瞳孔小），上眼睑被粗眉毛压住一点；"
    "鼻子扁而塌、鼻孔大而外翻；耳朵又长又尖、向两侧斜伸；头顶一撮硬邦邦的莫西干呆毛；"
    "**微微驼背、脑袋往前伸**，肩膀宽厚、**手臂粗壮、比腿略长**、手掌大、指节粗；"
    "皮肤是**饱和的深绿色**平涂。脖子上一条简单的皮项圈、腰上一条简单腰带（方形扣）、"
    "脚上一双简单的厚靴子、一边肩膀上挂一块简单的小护肩——都用线条画，不要金属反光和渐变。"
    "身体保持**圆滚滚的三头身**：**肚子又圆又鼓**，"
    "**绝对不要画胸肌、腹肌或任何肌肉线条**，身体只有外轮廓线加一层平涂色，不要用灰色阴影表现体积。"
    "**务必保持线条画风：不画肌肉线条、不画渐变和阴影、不做写实渲染。**"
)
FRAMING = (
    "全身、正面、居中，纯色品红背景（#CC1166）；背景必须干净——不要画任何投影、影子、地面、"
    "边框或文字。"
)
STYLE = LINE + CHARACTER + FRAMING
# While a turn runs he paddles laps around the composer bubble.
SWIM = (
    LINE + CHARACTER + "现在他正在水里游泳：只有上半身和脑袋露出水面，身体周围有一圈手绘的水花和波纹，"
    "两只小短手像划水一样一上一下地划，嘴巴张着傻叫、表情开心。" + FRAMING
)
# …and when the turn drags he goes under.
DROWN = (
    LINE + CHARACTER + "现在他快要溺水了：水面没过身体，他举着两只小短手在水面扑腾，"
    "眼睛变成晕眩的圈圈、嘴巴张着吐气泡，一串小气泡往上冒，表情又傻又慌（可爱而不是恐怖），"
    "水花与波纹也用线条画。" + FRAMING
)
PROMPTS = {
    # --- shout set A: waving both arms and hopping (the first set, kept as base)
    "shout-a2": STYLE + "姿势：正在开心地大声喊叫，两只小短手举起来乱挥，嘴巴张得很大、舌头伸出来，"
    "一只眼珠歪向旁边（斗鸡眼），表情兴奋开心而不是愤怒。",
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


WASH = (150, 200, 110)  # the pale green every frame's skin is pulled to


def _blend(pixel: tuple, target: tuple, strength: float) -> tuple:
    return (
        round(pixel[0] + (target[0] - pixel[0]) * strength),
        round(pixel[1] + (target[1] - pixel[1]) * strength),
        round(pixel[2] + (target[2] - pixel[2]) * strength),
        pixel[3],
    )


def apply_wash(image: Image.Image) -> Image.Image:
    """Pull every frame's skin to the same pale green.

    The style asks for "one flat wash of colour and otherwise bare paper", and the
    model's idea of how much green that is varies a lot — measured mean fills ran
    from near-white to a vivid green, which flickers badly in a flipbook. Pixels are
    classified by hue instead of by brightness, so only skin is touched: greens are
    pulled down toward the sheet colour, near-white (which is either skin the model
    left unpainted or paper) is pulled up to it, and the ink lines, the brown shorts
    and the blue water are saturated or dark enough to be left alone. An earlier cut
    washed every desaturated pixel and turned boots and blades green.
    """
    out = image.copy()
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            hue, saturation, value = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if saturation < 0.2 and value < 0.5:
                continue  # ink outlines: dark *and* neutral
            # Skin ranges from a pale green to a dark teal-green depending on the
            # frame (measured hue 0.35-0.55, value 0.2-0.9), so it is found by hue and
            # saturation rather than brightness, and pulled hard toward one flat
            # Ork green — which also flattens the volume shading the model likes to
            # add on the belly and arms, exactly as the line-art style wants.
            greenish = 0.34 <= hue <= 0.58 and saturation > 0.2
            papery = saturation <= 0.08 and value > 0.78
            if greenish:
                pixels[x, y] = _blend((r, g, b, a), WASH, 0.75)
            elif papery:
                pixels[x, y] = _blend((r, g, b, a), WASH, 0.75)
    return out


def build_strips(raw: pathlib.Path) -> None:
    """Assemble each strip with one scale and one baseline for all its frames.

    Fitting every frame on its own made the character pulse: a frame whose
    silhouette happened to be shorter got scaled up until it filled the box, so the
    flipbook breathed in and out. One scale for the strip (sized by the largest
    silhouette, so nothing is cut off) and a shared bottom edge fixes that — the
    feet stay on the ground line and only the pose changes.
    """
    for name, frames in STRIPS.items():
        keyed = []
        for frame_name in frames:
            source = raw / f"{frame_name}.png"
            if not source.exists():
                raise SystemExit(f"missing raw frame: {source}")
            keyed.append(apply_wash(drop_speckles(key_magenta(Image.open(source)))))
        boxes = [image.getbbox() for image in keyed]
        if any(box is None for box in boxes):
            raise SystemExit(f"{name}: a frame is empty after keying")
        widest = max(box[2] - box[0] for box in boxes)
        tallest = max(box[3] - box[1] for box in boxes)
        scale = min((FRAME_W - 2) / widest, (FRAME_H - 2) / tallest)
        strip = Image.new("RGBA", (FRAME_W, FRAME_H * len(frames)), (0, 0, 0, 0))
        for index, (image, box) in enumerate(zip(keyed, boxes)):
            character = image.crop(box)
            size = (max(1, round(character.width * scale)), max(1, round(character.height * scale)))
            character = character.resize(size, Image.LANCZOS)
            frame = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
            frame.paste(character, ((FRAME_W - size[0]) // 2, FRAME_H - size[1]))
            strip.paste(frame.quantize(colors=PALETTE_COLORS, method=Image.FASTOCTREE), (0, index * FRAME_H))
        target = ASSETS / name
        strip.save(target, optimize=True)
        print(f"{target.relative_to(ROOT)}: {strip.width}x{strip.height}, {len(frames)} frames, {target.stat().st_size} bytes")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=pathlib.Path, help="directory of saved raw frames (skips generation)")
    parser.add_argument("--only", action="append", help="generate just these frames (repeatable)")
    parser.add_argument("--style", type=pathlib.Path, help="style reference for the base frame (art direction)")
    parser.add_argument("--prompts", type=pathlib.Path, help="JSON restyle sheet: {style, prompts, references}")
    parser.add_argument("--rebase", type=pathlib.Path, help="re-edit these saved frames in place (pose preserved)")
    args = parser.parse_args()

    default_raw = pathlib.Path(os.environ.get("TEMP", "/tmp")) / "waaagh-mascot-raw"
    raw = args.raw or default_raw
    raw.mkdir(parents=True, exist_ok=True)

    if args.prompts:
        # A restyle sheet, so changing art direction does not mean editing this file:
        # {"prompts": {name: text}, "references": {name: other|""}}.
        sheet = json.loads(args.prompts.read_text(encoding="utf-8"))
        PROMPTS.clear()
        PROMPTS.update(sheet["prompts"])
        REFERENCES.clear()
        REFERENCES.update(sheet.get("references", {name: None for name in sheet["prompts"]}))

    def generate(name: str) -> None:
        reference = REFERENCES.get(name)
        if reference:
            source = raw / f"{reference}.png"
        elif args.rebase is not None and (args.rebase / f"{name}.png").exists():
            # Re-edit the frame we already have: a redesign keeps the poses that took
            # a whole round of prompts to get right, and only the character changes.
            source = args.rebase / f"{name}.png"
        else:
            source = args.style
        request_frame(PROMPTS[name], source, raw / f"{name}.png")

    if args.only:
        for name in args.only:
            generate(name)
    elif not args.raw:
        print(f"generating {len(PROMPTS)} frames with {MODEL}")
        for name in PROMPTS:
            generate(name)

    build_strips(raw)


if __name__ == "__main__":
    sys.exit(main())
