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

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "src" / "assets"
FRAME_W, FRAME_H = 128, 160
PALETTE_COLORS = 64

BASE = os.environ.get("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
MODEL = os.environ.get("VOLC_IMAGE_MODEL", "doubao-seedream-4-0-250828")

# The character sheet every prompt repeats: without it the model redesigns him.
STYLE = (
    "严格保持参考图中这个角色的设计：亮绿色皮肤、红色眼睛、粗黑描边、16-bit 像素风、"
    "尖刺金属护肩、棕色腰带（金属带扣）、棕色裤子、金属靴子。整体构图：全身、正面、居中、"
    "纯色品红背景（#CC1166），背景必须干净无阴影（阴影也必须是同一品红色）、无地面、无文字。"
)
PROMPTS = {
    # Loop order matters: the stylesheet walks these three in order.
    "shout-b": (
        "16-bit 像素风游戏精灵图，一个卡通兽人小子（Warhammer 40k greenskin），全身正面，"
        "正在冲锋咆哮：嘴巴张到最大露出两颗大獠牙和方牙，红眼怒视，亮绿色皮肤，尖刺钢铁护肩，"
        "棕色腰带加金属带扣，棕色裤子，巨大金属靴子，一拳举在身侧，粗黑描边、平涂色块、无抗锯齿，"
        "居中，处于纯色品红背景上"
    ),
    "idle": STYLE + "姿势改为：站立放松待命，双手自然垂在身体两侧，其中一只手扶着插在地上的砍刀刀柄；"
    "嘴巴闭合但露出两颗下獠牙，眼睛半眯着显得无聊。整体是“等着被派活”的懒得动的样子。",
    "idle-blink": "严格保持参考图中这个角色的设计、姿势、构图和纯色品红背景，一点都不要改动，只改一处："
    "把眼睛闭上，闭成一条向下的黑线（正在眨眼），不要动其它任何地方。16-bit 像素风、粗黑描边、全身、居中。",
    "shout-a": STYLE + "姿势改为：正面咆哮，身体后仰、双臂向两侧后方甩开，嘴巴张到最大正在喊叫，眼睛瞪成愤怒的红眼。",
    "shout-c": STYLE + "姿势改为：双拳高举过头顶咆哮，身体向上伸展，嘴巴张到最大，红眼怒视前方。",
}
# Each frame is generated from a reference so the character survives the pose change.
REFERENCES = {
    "shout-b": None,
    "idle": "shout-b",
    "idle-blink": "idle",
    "shout-a": "shout-b",
    "shout-c": "shout-b",
}
STRIPS = {
    "ork-idle.png": ["idle", "idle-blink"],
    "ork-shout.png": ["shout-a", "shout-b", "shout-c"],
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


def fit_frame(image: Image.Image) -> Image.Image:
    """Crop to the character, fit one 128x160 frame and quantise."""
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
