import os, time
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots", "mobile")
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 320}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.goto("http://localhost:5173/login", wait_until="networkidle")
    pg.fill("#employeeId", "1001"); pg.fill("#password", "password123")
    pg.click("button[type=submit]")
    pg.wait_for_url("http://localhost:5173/", wait_until="networkidle")
    time.sleep(1.5)
    pg.screenshot(path=os.path.join(OUT, "header_new.png"))
    # Abre el menú de usuario
    pg.get_by_role("button", name="Administradora Demo").click()
    time.sleep(0.6)
    pg.screenshot(path=os.path.join(OUT, "header_usermenu.png"))
    print("ok")
    b.close()
