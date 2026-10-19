import io, sys, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots", "mobile")
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2).new_page()
    pg.goto(BASE + "/login", wait_until="networkidle")
    pg.fill("#employeeId", "2002"); pg.fill("#password", "password123")
    pg.click("button[type=submit]")
    pg.wait_for_url(BASE + "/", wait_until="networkidle")
    time.sleep(1)

    # Abrir asistente flotante
    pg.get_by_role("button", name="Abrir asistente de búsqueda").click()
    time.sleep(0.6)
    assert pg.get_by_text("Asistente de búsqueda").count() >= 1, "no abrió el panel"

    # Preguntar
    pg.get_by_placeholder("Escribe tu pregunta…").fill("¿Se han encontrado botellas hoy?")
    pg.get_by_role("button", name="Enviar").click()
    time.sleep(1.5)
    body = pg.content()
    assert "objeto" in body.lower(), "no respondió"
    assert "Botella de agua azul" in body, "no enlazó el objeto real"
    pg.screenshot(path=os.path.join(OUT, "assistant.png"))
    print("asistente responde con datos reales OK")
    b.close()
    print("ASISTENTE OK")
