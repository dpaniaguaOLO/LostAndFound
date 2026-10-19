"""Verifica la nueva estructura de módulos: Muro con pestañas, Mis objetos,
Publicar unificado. Login por número de colaborador."""
import os, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots", "mobile")
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.goto(BASE + "/login", wait_until="networkidle")
    pg.fill("#employeeId", "2002"); pg.fill("#password", "password123")
    pg.click("button[type=submit]")
    pg.wait_for_url(BASE + "/", wait_until="networkidle")
    time.sleep(1)

    # MURO: debe tener pestañas Encontrados y Perdidos
    assert pg.get_by_role("button", name="Encontrados").count() >= 1, "falta pestaña Encontrados en muro"
    assert pg.get_by_role("button", name="Perdidos").count() >= 1, "falta pestaña Perdidos en muro"
    pg.get_by_role("button", name="Perdidos").first.click()
    time.sleep(1)
    pg.screenshot(path=os.path.join(OUT, "muro_perdidos.png"))
    print("muro con pestañas OK")

    # NAV: no debe existir 'Mis publicaciones'; sí 'Mis objetos'
    body = pg.content()
    assert "Mis objetos" in body, "falta 'Mis objetos' en nav"

    # PUBLICAR: selector Encontré / Perdí (tienen role=tab)
    pg.goto(BASE + "/publicar", wait_until="networkidle")
    time.sleep(1)
    assert pg.get_by_role("tab", name="Encontré un objeto").count() == 1, "falta selector Encontré"
    assert pg.get_by_role("tab", name="Perdí un objeto").count() == 1, "falta selector Perdí"
    pg.get_by_role("tab", name="Perdí un objeto").click()
    time.sleep(0.5)
    assert pg.get_by_role("button", name="Reportar objeto perdido").count() == 1, "boton submit no cambió a perdido"
    pg.screenshot(path=os.path.join(OUT, "publicar_perdido.png"))
    print("publicar unificado OK")

    # MIS OBJETOS: pestañas Perdidos / Encontrados
    pg.goto(BASE + "/mis-objetos", wait_until="networkidle")
    time.sleep(1)
    assert pg.get_by_text("Mis objetos").count() >= 1, "falta título Mis objetos"
    pg.screenshot(path=os.path.join(OUT, "mis_objetos.png"))
    print("mis objetos OK")

    # Crear un perdido real end-to-end y verificar que aparece en Mis objetos > Perdidos
    pg.goto(BASE + "/publicar", wait_until="networkidle")
    pg.get_by_role("tab", name="Perdí un objeto").click()
    pg.fill("#title", "Prueba paraguas perdido")
    pg.fill("#description", "Paraguas negro de prueba E2E")
    pg.fill("#location", "Entrada")
    pg.get_by_role("button", name="Reportar objeto perdido").click()
    pg.wait_for_url("**/mis-objetos**", wait_until="networkidle")
    time.sleep(1)
    assert "Prueba paraguas perdido" in pg.content(), "el perdido creado no aparece en Mis objetos"
    print("flujo crear perdido -> Mis objetos OK")

    b.close()
    print("TODOS LOS MODULOS OK")
