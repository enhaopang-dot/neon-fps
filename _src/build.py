# -*- coding: utf-8 -*-
"""把 three.js + 各源码片段拼成单个可双击运行的 HTML"""
from pathlib import Path

BASE = Path(__file__).resolve().parent
SRC = BASE / "src"
PARTS = [
    "00-util.js",
    "10-core.js",
    "20-world.js",
    "30-weather.js",
    "40-weapon.js",
    "50-game.js",
]

three = (BASE / "three.bundle.js").read_text(encoding="utf-8")
html = (SRC / "index.html").read_text(encoding="utf-8")

chunks = []
for name in PARTS:
    p = SRC / name
    if not p.exists():
        raise SystemExit(f"缺少源码片段: {name}")
    chunks.append(f"\n/* ===== {name} ===== */\n" + p.read_text(encoding="utf-8"))

game = "(function(){\n'use strict';\n" + "\n".join(chunks) + "\n})();\n"

assert "</script" not in three.lower(), "three.bundle 含有 </script>，需要转义"
assert "</script" not in game.lower(), "游戏源码含有 </script>，需要转义"

html = html.replace("/*__THREE__*/", three)
html = html.replace("/*__GAME__*/", game)

out = BASE.parent / "霓虹雨夜FPS.html"
out.write_text(html, encoding="utf-8")

kb = out.stat().st_size / 1024
print(f"OK -> {out}")
print(f"size: {kb:.1f} KB")
