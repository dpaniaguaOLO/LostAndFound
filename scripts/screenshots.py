"""Captura pantallas reales de Lost and Found con Playwright (Chromium).
Inicia sesión como admin y guarda PNG de cada pantalla en docs/screenshots/.
Requiere el frontend en http://localhost:5173 y el backend en :4000.
"""
import os
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots")
os.makedirs(OUT, exist_ok=True)

# Viewport tipo laptop para que las capturas se vean limpias.
VIEWPORT = {"width": 1366, "height": 900}


def shot(page, name):
    path = os.path.join(OUT, f"{name}.png")
    page.screenshot(path=path)
    print("saved", name)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport=VIEWPORT, device_scale_factor=2)
    page = ctx.new_page()

    # --- Login (captura de la pantalla de acceso) ---
    page.goto(BASE + "/login", wait_until="networkidle")
    time.sleep(1.5)  # deja cargar la fuente Open Sans y el logo
    shot(page, "01_login")

    # Inicia sesión como admin.
    page.fill("#email", "admin@empresa.com")
    page.fill("#password", "password123")
    page.click("button[type=submit]")
    page.wait_for_url(BASE + "/", wait_until="networkidle")
    time.sleep(1.5)
    shot(page, "02_muro")

    # Detalle del primer objeto del muro.
    page.click("a[href^='/objetos/']")
    page.wait_for_url("**/objetos/**", wait_until="networkidle")
    time.sleep(1.2)
    shot(page, "03_detalle")

    # Publicar objeto encontrado.
    page.goto(BASE + "/publicar", wait_until="networkidle")
    time.sleep(1)
    shot(page, "04_publicar")

    # Objetos perdidos.
    page.goto(BASE + "/perdidos", wait_until="networkidle")
    time.sleep(1)
    shot(page, "05_perdidos")

    # Reclamaciones (recibidas, con la pendiente del empleado).
    page.goto(BASE + "/reclamaciones", wait_until="networkidle")
    time.sleep(1.2)
    shot(page, "06_reclamaciones")

    # Notificaciones.
    page.goto(BASE + "/notificaciones", wait_until="networkidle")
    time.sleep(1.2)
    shot(page, "07_notificaciones")

    # Panel administrativo.
    page.goto(BASE + "/admin", wait_until="networkidle")
    time.sleep(1.2)
    shot(page, "08_admin")

    browser.close()
    print("Listo. Capturas en docs/screenshots/")
