import io, sys, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots", "mobile")
cafe = os.path.join(OUT, "_tmp_cafe.png")
Image.new("RGB", (200, 200), (120, 80, 40)).save(cafe)

LONG = "Cartera de piel color café oscuro con costuras y múltiples tarjetas LN"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={"width": 1280, "height": 1000}, device_scale_factor=2).new_page()
    pg.goto(BASE + "/login", wait_until="networkidle")
    pg.fill("#employeeId", "2002"); pg.fill("#password", "password123")
    pg.click("button[type=submit]")
    pg.wait_for_url(BASE + "/", wait_until="networkidle"); time.sleep(1)

    # Encontrado con nombre largo + imagen
    pg.goto(BASE + "/publicar", wait_until="networkidle")
    pg.fill("#title", LONG)
    pg.fill("#description", "billetera marron de cuero con tarjetas")
    pg.fill("#location", "Recepcion")
    pg.locator("input[type=file]").first.set_input_files(cafe); time.sleep(0.4)
    pg.get_by_role("button", name="Publicar objeto encontrado").click()
    pg.wait_for_url("**/objetos/**", wait_until="networkidle")

    # Perdido que coincide
    pg.goto(BASE + "/publicar", wait_until="networkidle")
    pg.get_by_role("tab", name="Perdí un objeto").click(); time.sleep(0.3)
    pg.fill("#title", "Mi cartera cafe LN")
    pg.fill("#description", "billetera marron de cuero que perdi")
    pg.locator("input[type=file]").first.set_input_files(cafe); time.sleep(0.4)
    pg.get_by_role("button", name="Reportar objeto perdido").click()
    pg.wait_for_url("**/mis-objetos**", wait_until="networkidle"); time.sleep(1)

    # Captura la tarjeta angosta en Mis objetos (expande coincidencias)
    pg.get_by_role("button", name="Ver posibles coincidencias").first.click()
    time.sleep(1.5)
    assert LONG in pg.content(), "el nombre largo no aparece"
    pg.screenshot(path=os.path.join(OUT, "longname_card.png"), full_page=True)
    print("tarjeta angosta con nombre largo OK")

    # Detalle del perdido
    pg.get_by_role("link", name="Mi cartera cafe LN").first.click()
    pg.wait_for_url("**/perdidos/**", wait_until="networkidle"); time.sleep(1.5)
    pg.screenshot(path=os.path.join(OUT, "longname_detail.png"), full_page=True)
    print("detalle con nombre largo OK")
    b.close()
    os.remove(cafe)
    print("LONGNAME OK")
