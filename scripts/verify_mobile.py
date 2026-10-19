"""Verificación E2E móvil: login por número de colaborador, navegación nueva,
botones de cámara/archivo en publicar, y capturas en viewport de teléfono.
"""
import os, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots", "mobile")
os.makedirs(OUT, exist_ok=True)
PHONE = {"width": 390, "height": 844}  # iPhone 12 aprox


def shot(page, name):
    page.screenshot(path=os.path.join(OUT, f"{name}.png"), full_page=True)
    print("shot", name)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport=PHONE, device_scale_factor=2, is_mobile=True)
    pg = ctx.new_page()

    pg.goto(BASE + "/login", wait_until="networkidle")
    time.sleep(1)
    # Verifica campo de número de colaborador y toggle de contraseña
    assert pg.locator("#employeeId").count() == 1, "falta campo employeeId"
    assert pg.get_by_label("Mostrar contraseña").count() >= 1, "falta toggle de contraseña"
    assert pg.get_by_text("Recordar este dispositivo").count() == 1, "falta recordar dispositivo"
    shot(pg, "login")

    # Login por número de colaborador (admin 1001)
    pg.fill("#employeeId", "1001")
    pg.fill("#password", "password123")
    pg.click("button[type=submit]")
    pg.wait_for_url(BASE + "/", wait_until="networkidle")
    time.sleep(1)
    shot(pg, "muro")

    # Abrir menú móvil y verificar etiquetas nuevas
    pg.get_by_label("Abrir menú").click()
    time.sleep(0.5)
    body = pg.content()
    assert "Objetos perdidos" in body, "falta 'Objetos perdidos' en nav"
    assert "Mis publicaciones" in body, "falta 'Mis publicaciones' en nav"
    assert "Mis cosas" not in body, "'Mis cosas' deberia haberse eliminado"
    shot(pg, "menu_movil")

    # Publicar: verificar botones de camara y archivo
    pg.goto(BASE + "/publicar", wait_until="networkidle")
    time.sleep(1)
    assert pg.get_by_role("button", name="Tomar foto").count() == 1, "falta boton Tomar foto"
    assert pg.get_by_role("button", name="Elegir archivo").count() == 1, "falta boton Elegir archivo"
    shot(pg, "publicar")

    # Admin: capturar para revisar contraste
    pg.goto(BASE + "/admin", wait_until="networkidle")
    time.sleep(1)
    shot(pg, "admin")

    b.close()
    print("VERIFICACION MOVIL OK")
