#!/usr/bin/env python3
"""Builds the mascot sprites (`src/assets/ork-idle.png`, `ork-work.png`).

The Ork is drawn by Volcano Ark's `doubao-seedream-4-0` image model rather than
by hand: the hand-drawn version in `scripts/sprite.mjs` kept losing the likeness
at mascot size, and the model keeps one character consistent across poses when
each frame is generated with a reference image chained off the previous one.

    export ARK_API_KEY=...            # or set it in the user environment
    python scripts/mascot.py          # generate the 9 frames, then build the 2 strips

    python scripts/mascot.py --raw <dir>   # rebuild the strips from saved frames
    python scripts/mascot.py --style <img> # art-direction reference for the base frame
    python scripts/mascot.py --raw <new> --rebase <old>   # redesign, keep the poses

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
# …and while a turn runs he hammers a keyboard, sweating and yelling.
WORK = (
    LINE + CHARACTER + "现在他正坐在电脑前拼命干活：面前是一台简单的手绘小电脑——"
    "屏幕上画着几行潦草的代码线，下面是一只小键盘，屏幕和键盘都只用线条画；"
    "他两只手都按在键盘上疯狂敲打，身体前倾、脑袋凑近屏幕，"
    "嘴巴张得很大在喊 WAAAGH，眉毛狠狠皱起来，额头和脑袋旁边飞出几滴汗珠（汗珠也用线条画）。"
    "画面里**不要出现任何文字、字母、数字、图标或符号**——不要对话框、不要音效字、不要火花碎片。"
    + FRAMING
)
PROMPTS = {
    # --- idle: sitting on the ground, three frames so the blink is a roll
    "idle1": STYLE + "姿势改为：一屁股坐在地上，两条小短腿往前伸直，一只手撑地、另一只手挠着圆肚子，"
    "脑袋歪向一边傻笑，眼睛又大又圆、一只眼珠歪向旁边，一副无所事事的呆样。",
    "idle2": "严格保持参考图中这个角色的设计、姿势、构图和纯色品红背景，一点都不要改动，只改一处："
    "把眼睛闭到一半（眼皮盖住眼珠的下半部分，正在眨眼的中途），不要动其它任何地方。",
    "idle3": "严格保持参考图中这个角色的设计、姿势、构图和纯色品红背景，一点都不要改动，只改一处："
    "把眼睛完全闭上，闭成两条向下的黑线（正在眨眼），不要动其它任何地方。",
    # --- work: at the keyboard. Chained off work1 so the desk, screen and keyboard
    # stay the same object from frame to frame.
    "work1": WORK + "姿势：两只手都按在键盘上，身体前倾到最前面，嘴巴张到最大在喊，额头上冒出第一滴汗。",
    "work2": WORK + "姿势：左手抬起来离开键盘、右手重重按下去，身体跟着往前一顿，两滴汗飞出去。",
    "work3": WORK + "姿势：右手抬起来、左手重重按下去（和参考图方向相反），脑袋往前一探，汗珠更多。",
    "work4": WORK + "姿势：两只手同时离开键盘举起来喊 WAAAGH，眼睛瞪到最大，汗珠往下滴。",
    "work5": WORK + "姿势：两只手同时砸在键盘上，身体往下压，嘴巴张到最大，桌上的水杯被震得跳了一下。",
    "work6": WORK + "姿势：一只手还在键盘上敲、另一只手抬起来擦额头上的汗，眼睛眯起来但嘴还在喊。",
}
# The idle base settles the design; work1 hangs off it so the Ork at the desk is the
# same Ork, and the rest of the work frames hang off work1 to keep the desk fixed.
REFERENCES = {
    "idle1": None,
    "idle2": "idle1",
    "idle3": "idle1",
    "work1": "idle1",
    "work2": "work1",
    "work3": "work1",
    "work4": "work1",
    "work5": "work1",
    "work6": "work3",
}
# Two states, two strips: sitting while nothing is asked of him, typing while the
# model works. The idle strip is three frames (open, half shut, shut) so the blink is
# a roll; the work strip is six.
STRIPS = {
    "ork-idle.png": ["idle1", "idle2", "idle3"],
    "ork-work.png": ["work1", "work2", "work3", "work4", "work5", "work6"],
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
