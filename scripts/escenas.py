"""Builds every scene in img/escenas/<id>/ for the extension.

Each scene folder has a background, one or more sheets of characters and an escena.json describing
its floors, scenery props and cast. This script cuts each character out of the sheets, cleans the nearly
invisible leftovers of the background removal, cuts the props out of the background, makes everything light
(public/escenas/<id>/*.webp) and writes the data the code reads (src/core/scenes.gen.ts).

Tooling only (the extension itself has no dependencies). Needs Pillow:
    python -m pip install pillow
    python scripts/escenas.py             # builds all scenes
    python scripts/escenas.py --check     # also writes, per scene, img/escenas/<id>/_recortes.png (numbered cuts),
                                          # _recortes/ (each cut, for the calibrator) and _vista.png (floors and
                                          # props drawn over the background)
    python scripts/escenas.py --calibrar  # opens the calibrator (scripts/calibrador.html) on http://127.0.0.1:8770:
                                          # click floor corners, outline props, name characters, then "Guardar"
                                          # writes escena.json and rebuilds everything

Adding a scene: make img/escenas/<id>/ with fondo.png and the character sheets (transparent PNG), then run
with --calibrar. Scenes open by "orden" in escena.json (folder name if missing). A scene without floors is
cut but left out of the extension until it has some.
"""

import colorsys
import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "img" / "escenas"
OUT = ROOT / "public" / "escenas"
GEN = ROOT / "src" / "core" / "scenes.gen.ts"
SCALE = 4          # segmentation works on a smaller mask
MIN_AREA = 40      # in small-mask pixels; drops specks
SPRITE_MAX = 192   # longest side of each exported character, in px
BG_WIDTH = 1280    # scenes are drawn in these pixels; escena.json coordinates use them too


def clean(im: Image.Image) -> Image.Image:
    """Alpha < 24 becomes fully transparent (the red/yellow halo has alpha 1-2); near-opaque becomes opaque."""
    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < 24 else (255 if v > 240 else v))
    return Image.merge("RGBA", (r, g, b, a))


def components(im: Image.Image) -> list[tuple[tuple[int, int, int, int], Image.Image]]:
    """Each separate drawing: its bounding box and a mask with only its own pixels,
    found on a downscaled mask (so a neighbour's tail inside the box is left out)."""
    w, h = im.size
    small = im.getchannel("A").resize((w // SCALE, h // SCALE), Image.Resampling.BOX)
    sw, sh = small.size
    px = small.load()
    on = [[px[x, y] > 40 for x in range(sw)] for y in range(sh)]
    seen = [[False] * sw for _ in range(sh)]
    found = []
    for y0 in range(sh):
        for x0 in range(sw):
            if not on[y0][x0] or seen[y0][x0]:
                continue
            q = deque([(x0, y0)])
            seen[y0][x0] = True
            x1 = x2 = x0
            y1 = y2 = y0
            cells = []
            while q:
                x, y = q.popleft()
                cells.append((x, y))
                x1, x2, y1, y2 = min(x1, x), max(x2, x), min(y1, y), max(y2, y)
                for dx in (-2, -1, 0, 1, 2):  # reach over 1px gaps (balloon strings, feathers)
                    for dy in (-2, -1, 0, 1, 2):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < sw and 0 <= ny < sh and on[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            q.append((nx, ny))
            if len(cells) < MIN_AREA:
                continue
            mask = Image.new("L", (sw, sh), 0)
            mp = mask.load()
            for x, y in cells:
                for dx in (-1, 0, 1):  # a little margin for antialiased edges
                    for dy in (-1, 0, 1):
                        if 0 <= x + dx < sw and 0 <= y + dy < sh:
                            mp[x + dx, y + dy] = 255
            mask = mask.resize((w, h), Image.Resampling.NEAREST)
            box = (x1 * SCALE, y1 * SCALE, min(w, (x2 + 1) * SCALE), min(h, (y2 + 1) * SCALE))
            found.append((box, mask))
    found.sort(key=lambda b: (b[0][1] // 120, b[0][0]))
    return found


def cut_sheet(path: Path) -> list[tuple[Image.Image, tuple[int, int]]]:
    """Each drawing of a sheet, made light, with its size in the sheet (that size sets how big it is drawn)."""
    im = clean(Image.open(path).convert("RGBA"))
    sprites = []
    for box, mask in components(im):
        own = Image.new("RGBA", im.size, (0, 0, 0, 0))
        own.paste(im, (0, 0), mask)
        sprite = own.crop(box)
        sprite = sprite.crop(sprite.getbbox())
        native = sprite.size
        sprite.thumbnail((SPRITE_MAX, SPRITE_MAX), Image.Resampling.LANCZOS)
        sprites.append((sprite, native))
    return sprites


def is_ground(r: int, g: int, b: int) -> bool:
    """Sunlit grass, or pale stones and sand: what a colour-keyed prop should leave out."""
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return (0.13 < h < 0.30 and v > 0.42) or (s < 0.35 and v > 0.62)


def cut_prop(original: Image.Image, spec: dict) -> tuple[Image.Image, tuple[int, int, int, int]]:
    k = original.width / BG_WIDTH
    poly = [tuple(p) for p in spec["poligono"]]
    xs = [x for x, _ in poly]
    ys = [y for _, y in poly]
    box = (min(xs), min(ys), max(xs), max(ys))
    crop = original.crop(tuple(round(v * k) for v in box)).convert("RGBA")
    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).polygon([((x - box[0]) * k, (y - box[1]) * k) for x, y in poly], fill=255)
    if spec.get("llave"):
        px, mp = crop.load(), mask.load()
        for y in range(crop.height):
            for x in range(crop.width):
                if mp[x, y] and is_ground(*px[x, y][:3]):
                    mp[x, y] = 0
        mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    crop.putalpha(mask)
    crop = crop.resize((box[2] - box[0], box[3] - box[1]), Image.Resampling.LANCZOS)
    return crop, box


def contact_sheet(cuts: dict[str, list[tuple[Image.Image, tuple[int, int]]]], path: Path) -> None:
    items = [(f"{sheet}#{i}", sp) for sheet, sprites in cuts.items() for i, (sp, _) in enumerate(sprites)]
    cell, cols = 210, 8
    rows = (len(items) + cols - 1) // cols
    out = Image.new("RGBA", (cols * cell, max(1, rows) * cell), (60, 110, 60, 255))
    draw = ImageDraw.Draw(out)
    for n, (label, sp) in enumerate(items):
        x, y = (n % cols) * cell, (n // cols) * cell
        out.alpha_composite(sp, (x + 9, y + 14))
        draw.text((x + 4, y + 2), f"{label} {sp.width}x{sp.height}", fill=(255, 255, 255, 255))
    out.save(path)


def export_cuts(folder: Path, cuts: dict, sheets: dict[str, int]) -> None:
    """Every cut as its own PNG plus an index, for the calibrator (scripts/calibrador.html)."""
    target = folder / "_recortes"
    target.mkdir(exist_ok=True)
    for old in target.glob("*.png"):
        old.unlink()
    index = []
    for sheet, sprites in cuts.items():
        for i, (sprite, (nw, nh)) in enumerate(sprites):
            name = f"{Path(sheet).stem}-{i}.png"
            sprite.save(target / name)
            index.append({"recorte": f"{sheet}#{i}", "archivo": name, "nw": nw, "nh": nh})
    (target / "indice.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")


def homography(q):
    """Same map as src/core/perspective.ts squareToQuad, for the preview."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = q
    dx1, dx2, dx3 = x1 - x2, x3 - x2, x0 - x1 + x2 - x3
    dy1, dy2, dy3 = y1 - y2, y3 - y2, y0 - y1 + y2 - y3
    if abs(dx3) < 1e-9 and abs(dy3) < 1e-9:
        m = (x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0)
    else:
        den = dx1 * dy2 - dx2 * dy1
        g = (dx3 * dy2 - dx2 * dy3) / den
        h = (dx1 * dy3 - dx3 * dy1) / den
        m = (x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h)
    a, b, c, d, e, f, g, h = m
    return lambda u, v: ((a * u + b * v + c) / (g * u + h * v + 1), (d * u + e * v + f) / (g * u + h * v + 1))


def preview(bg: Image.Image, escena: dict, path: Path) -> None:
    out = bg.convert("RGBA")
    draw = ImageDraw.Draw(out)
    for piso in escena["pisos"]:
        t = homography(piso["esquinas"])
        cols, rows = piso["cols"], piso["rows"]
        blocked = {tuple(c) for c in piso.get("bloqueadas", [])}
        for y in range(rows):
            for x in range(cols):
                pts = [t(x / cols, y / rows), t((x + 1) / cols, y / rows), t((x + 1) / cols, (y + 1) / rows),
                       t(x / cols, (y + 1) / rows)]
                draw.polygon(pts, outline=(255, 60, 60) if (x, y) in blocked else (255, 255, 255))
        draw.text(t(0, 0), piso["id"], fill=(255, 255, 0))
    for name, spec in escena.get("objetos", {}).items():
        draw.polygon([tuple(p) for p in spec["poligono"]], outline=(0, 200, 255))
        draw.line([(0, spec["base"]), (out.width, spec["base"])], fill=(0, 200, 255, 90))
        draw.text(tuple(spec["poligono"][0]), name, fill=(0, 200, 255))
    out.save(path)


def build(folder: Path, check: bool, seen_ids: set[str]) -> dict:
    escena = json.loads((folder / "escena.json").read_text(encoding="utf-8"))
    sid = folder.name
    out = OUT / sid
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.webp"):
        old.unlink()

    original = Image.open(folder / escena["fondo"]).convert("RGB")
    bg = original.copy()
    bg.thumbnail((BG_WIDTH, BG_WIDTH), Image.Resampling.LANCZOS)
    bg.save(out / "fondo.webp", quality=80, method=6)

    props = []
    floor_ids = [p["id"] for p in escena["pisos"]]
    prop_names = list(escena.get("objetos", {}))
    for name in prop_names:
        spec = escena["objetos"][name]
        image, box = cut_prop(original, spec)
        image.save(out / f"objeto-{name}.webp", quality=85, method=6)
        props.append({"name": name, "x": box[0], "y": box[1], "w": box[2] - box[0], "h": box[3] - box[1],
                      "base": spec["base"]})

    sheets = {h["archivo"]: h["celda"] for h in escena["hojas"]}
    cuts = {sheet: cut_sheet(folder / sheet) for sheet in sheets}
    if check:
        contact_sheet(cuts, folder / "_recortes.png")
        preview(bg, escena, folder / "_vista.png")
        export_cuts(folder, cuts, sheets)

    cast = []
    for cid, p in escena.get("personajes", {}).items():
        if cid in seen_ids:
            raise SystemExit(f"{sid}: el personaje {cid} ya existe en otra escena")
        seen_ids.add(cid)
        sheet, _, index = p["recorte"].partition("#")
        sprites = cuts[sheet]
        if int(index) >= len(sprites):
            raise SystemExit(f"{sid}: {p['recorte']} no existe ({sheet} tiene {len(sprites)} recortes)")
        sprite, (nw, nh) = sprites[int(index)]
        sprite.save(out / f"{cid}.webp", quality=85, method=6)
        cell = sheets[sheet]
        if p["ancho"] not in (1, 2):
            raise SystemExit(f"{sid}: {cid} debe ocupar 1 o 2 cuadritos")
        # w: cells of floor it takes (1 or 2, one row deep). sw, sh: how big it looks, in cell widths.
        cast.append({"id": cid, "w": p["ancho"], "sw": round(nw / cell, 2), "sh": round(nh / cell, 2),
                     "name": p["nombre"]})

    floors = []
    for piso in escena["pisos"]:
        floor = {"id": piso["id"], "cols": piso["cols"], "rows": piso["rows"],
                 "blocked": piso.get("bloqueadas", []), "ground": piso["esquinas"]}
        if "sobre" in piso:
            floor["over"] = prop_names.index(piso["sobre"])
        floors.append(floor)
    assert len(set(floor_ids)) == len(floor_ids), f"{sid}: pisos repetidos"

    print(f"{sid}: {len(cast)} personajes, {len(floors)} pisos, {len(props)} objetos"
          + (f" (sin usar: {sum(len(s) for s in cuts.values()) - len(cast)} recortes)" if check else ""))
    return {"order": escena.get("orden", sid), "data": {
        "id": sid, "name": escena["nombre"], "unlock": int(escena.get("desbloqueo", 0)),
        "width": bg.width, "height": bg.height,
        "floors": floors, "props": props, "cast": cast}}


def build_all(check: bool) -> None:
    seen: set[str] = set()
    scenes = [build(f, check, seen) for f in sorted(SRC.iterdir()) if (f / "escena.json").exists()]
    scenes = [s for s in scenes if s["data"]["floors"]]
    scenes.sort(key=lambda s: str(s["order"]))
    rows = "".join(f"  {json.dumps(s['data'], ensure_ascii=False)},\n" for s in scenes)
    body = f"[\n{rows}]"
    GEN.write_text(
        "// Generated by scripts/escenas.py from img/escenas/*/escena.json. Do not edit by hand.\n"
        "import type { SceneData } from './scenes.js';\n\n"
        f"export const SCENES = {body} as const satisfies readonly SceneData[];\n",
        encoding="utf-8",
    )
    print(f"-> {GEN.relative_to(ROOT)}")


def format_escena(e: dict) -> str:
    """escena.json with one floor, prop or character per line, easy to read and to diff."""
    line = lambda v: json.dumps(v, ensure_ascii=False)
    block = lambda o: "{\n" + ",\n".join(f"    {line(k)}: {line(v)}" for k, v in o.items()) + "\n  }" if o else "{}"
    items = lambda xs: "[\n" + ",\n".join(f"    {line(x)}" for x in xs) + "\n  ]" if xs else "[]"
    return (
        "{\n"
        f'  "nombre": {line(e["nombre"])},\n  "orden": {line(e.get("orden", 99))},\n'
        f'  "desbloqueo": {line(e.get("desbloqueo", 0))},\n  "fondo": {line(e["fondo"])},\n'
        f'  "hojas": {items(e["hojas"])},\n  "pisos": {items(e["pisos"])},\n'
        f'  "objetos": {block(e.get("objetos", {}))},\n  "personajes": {block(e.get("personajes", {}))}\n}}\n'
    )


def serve(port: int = 8770) -> None:
    """Local calibrator: serves the project to 127.0.0.1 only and saves escena.json files."""
    import contextlib
    import http.server
    import io
    import webbrowser

    def folders() -> list[dict]:
        out = []
        for f in sorted(SRC.iterdir()):
            if not (f / "fondo.png").exists():
                continue
            images = sorted(p.name for p in f.glob("*.png") if p.name != "fondo.png" and not p.name.startswith("_"))
            out.append({"id": f.name, "escena": (f / "escena.json").exists(), "hojas": images})
        return out

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def log_message(self, *_):
            pass

        def reply(self, code: int, payload: dict) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_GET(self):
            if self.path == "/":
                self.send_response(302)
                self.send_header("Location", "/scripts/calibrador.html")
                self.end_headers()
            elif self.path == "/escenas":
                self.reply(200, {"escenas": folders()})
            else:
                super().do_GET()

        def do_POST(self):
            sid = self.path.removeprefix("/guardar/")
            if not self.path.startswith("/guardar/") or sid not in {f["id"] for f in folders()}:
                return self.reply(404, {"ok": False, "log": "Escena desconocida"})
            try:
                escena = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                for key in ("nombre", "fondo", "hojas", "pisos"):
                    if key not in escena:
                        raise ValueError(f"falta {key}")
                (SRC / sid / "escena.json").write_text(format_escena(escena), encoding="utf-8")
                log = io.StringIO()
                with contextlib.redirect_stdout(log):
                    build_all(check=True)
                self.reply(200, {"ok": True, "log": log.getvalue()})
            except (ValueError, KeyError, SystemExit, OSError) as err:
                self.reply(400, {"ok": False, "log": str(err)})

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/scripts/calibrador.html"
    print(f"Calibrador en {url}  (Ctrl+C para salir)")
    if "--no-abrir" not in sys.argv:
        webbrowser.open(url)
    with contextlib.suppress(KeyboardInterrupt):
        server.serve_forever()


if __name__ == "__main__":
    if "--calibrar" in sys.argv:
        build_all(check=True)
        serve()
    else:
        build_all(check="--check" in sys.argv)
