# -*- coding: utf-8 -*-
"""无头验证：加载单文件、抓控制台错误、出截图"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).resolve().parent
HTML = BASE.parent / "霓虹雨夜FPS.html"
SHOT = BASE / "shots"
SHOT.mkdir(exist_ok=True)

errors, logs = [], []

with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        "--use-gl=angle", "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
    ])
    page = browser.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
    page.on("console", lambda m: (logs.append(f"[{m.type}] {m.text}"),
                                  errors.append(m.text) if m.type == "error" else None))
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))

    page.goto(HTML.as_uri())
    page.wait_for_timeout(9000)

    print("=== console ===")
    for l in logs[-40:]:
        print(l)

    page.screenshot(path=str(SHOT / "01-menu.png"))

    # 跳过菜单直接进游戏画面
    page.evaluate("""() => {
        const ov = document.getElementById('overlay');
        ov.classList.add('hide');
        document.getElementById('hud').classList.add('on');
        window.NR.G.state = 'playing';
        window.NR.player.pos.set(0, 1.68, 14);
    }""")
    page.wait_for_timeout(2500)
    page.screenshot(path=str(SHOT / "02-street.png"))

    # 换个机位
    page.evaluate("""() => {
        window.NR.player.pos.set(-2.2, 3.4, 2);
        window.NR.player.yaw = 0.5;
        window.NR.player.pitch = 0.05;
    }""")
    page.wait_for_timeout(1800)
    page.screenshot(path=str(SHOT / "03-angle.png"))

    # 看枪口与靶子
    page.evaluate("""() => {
        window.NR.player.pos.set(1.5, 1.68, 8);
        window.NR.player.yaw = -0.15;
        window.NR.player.pitch = 0.02;
    }""")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(SHOT / "04-gun.png"))

    info = page.evaluate("""() => ({
        calls: NR.core.renderer.info.render.calls,
        tris: NR.core.renderer.info.render.triangles,
        progs: NR.core.renderer.info.programs.length,
        state: NR.G.state,
    })""")
    print("=== render info ===", info)

    browser.close()

print("=== errors ===")
for e in errors[:30]:
    print(e)
print("error count:", len(errors))
