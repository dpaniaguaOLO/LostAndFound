import io, sys, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots", "mobile")
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={"width": 1280, "height": 1000}, device_scale_factor=2).new_page()
    pg.goto(BASE + "/login", wait_until="networkidle")
    pg.fill("#employeeId", "2002"); pg.fill("#password", "password123")
    pg.click("button[type=submit]")
    pg.wait_for_url(BASE + "/", wait_until="networkidle")
    time.sleep(1)

    # BÚSQUEDA INTELIGENTE en el muro
    assert pg.get_by_text("Búsqueda inteligente").count() >= 1, "falta buscador inteligente"
    pg.get_by_placeholder("¿Qué estás buscando?").fill("audífonos que perdí en el estacionamiento")
    pg.get_by_role("button", name="Buscar").click()
    time.sleep(1.5)
    body = pg.content()
    assert "Audífonos inalámbricos" in body, "la búsqueda no devolvió el objeto esperado"
    assert "%" in body, "no aparece el porcentaje de relevancia"
    pg.screenshot(path=os.path.join(OUT, "ai_search.png"))
    print("búsqueda inteligente OK")

    # Crear un perdido que coincida, para probar sugerencias
    pg.goto(BASE + "/publicar", wait_until="networkidle")
    pg.get_by_role("tab", name="Perdí un objeto").click()
    pg.fill("#title", "Audifonos bluetooth perdidos")
    pg.fill("#description", "Perdi mis auriculares inalambricos blancos")
    pg.fill("#location", "Estacionamiento nivel 1")
    pg.get_by_role("button", name="Reportar objeto perdido").click()
    pg.wait_for_url("**/mis-objetos**", wait_until="networkidle")
    time.sleep(1)

    # SUGERENCIAS en Mis objetos > Perdidos
    pg.get_by_role("button", name="Ver posibles coincidencias").first.click()
    time.sleep(1.5)
    body = pg.content()
    assert "Audífonos inalámbricos" in body, "no sugiere el encontrado correcto"
    assert "Misma categoría" in body or "Ubicación parecida" in body, "no muestra motivos"
    pg.screenshot(path=os.path.join(OUT, "ai_match.png"))
    print("sugerencias de coincidencia OK")

    b.close()
    print("IA FRONTEND OK")
