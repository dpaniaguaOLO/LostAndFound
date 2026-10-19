import io, sys, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots", "mobile")
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={"width": 1280, "height": 1000}, device_scale_factor=2).new_page()
    # Login admin (1001)
    pg.goto(BASE + "/login", wait_until="networkidle")
    pg.fill("#employeeId", "1001"); pg.fill("#password", "password123")
    pg.click("button[type=submit]")
    pg.wait_for_url(BASE + "/", wait_until="networkidle")
    time.sleep(1)

    # Panel admin con 3 pestañas
    pg.goto(BASE + "/admin", wait_until="networkidle")
    time.sleep(1)
    body = pg.content()
    assert "Resumen" in body and "Reclamaciones" in body and "Historial" in body, "faltan pestañas admin"
    # Historial
    pg.get_by_role("button", name="Historial").click()
    time.sleep(1.2)
    pg.screenshot(path=os.path.join(OUT, "admin_audit.png"))
    assert "por" in pg.content() or "Editó" in pg.content() or "Todavía no" in pg.content()
    print("panel admin con pestañas + historial OK")

    # Moderación en detalle: abrir un objeto y comprobar botones admin
    pg.goto(BASE + "/", wait_until="networkidle")
    pg.click("a[href^='/objetos/']")
    pg.wait_for_url("**/objetos/**", wait_until="networkidle")
    time.sleep(1)
    body = pg.content()
    assert "Administración" in body, "falta bloque de administración en detalle"
    assert "Archivar" in body and "Eliminar" in body, "faltan botones de moderación"
    pg.screenshot(path=os.path.join(OUT, "admin_moderation.png"))
    print("moderación de objeto (admin) OK")

    b.close()
    print("ADMIN UI OK")
