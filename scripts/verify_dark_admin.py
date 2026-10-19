"""Captura el panel admin en modo oscuro para revisar contraste."""
import os, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots", "mobile")
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    # Fuerza esquema oscuro del sistema + viewport escritorio para ver la tabla
    ctx = b.new_context(viewport={"width": 1280, "height": 900},
                        device_scale_factor=2, color_scheme="dark")
    pg = ctx.new_page()
    pg.goto(BASE + "/login", wait_until="networkidle")
    time.sleep(1)
    pg.fill("#employeeId", "1001")
    pg.fill("#password", "password123")
    pg.click("button[type=submit]")
    pg.wait_for_url(BASE + "/", wait_until="networkidle")
    pg.goto(BASE + "/admin", wait_until="networkidle")
    time.sleep(1.2)
    pg.screenshot(path=os.path.join(OUT, "admin_dark.png"))
    print("admin_dark listo")
    b.close()
