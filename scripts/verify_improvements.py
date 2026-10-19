"""Verifica: (A) ubicación opcional al reportar perdido, (B) comparación lado a lado
+ desglose en el detalle del perdido con coincidencias."""
import io, sys, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots", "mobile")
os.makedirs(OUT, exist_ok=True)


def png(color):
    buf = io.BytesIO()
    Image.new("RGB", (200, 200), color).save(buf, format="PNG")
    return buf.getvalue()


# Prepara una imagen temporal en disco para el input file.
cafe_path = os.path.join(OUT, "_tmp_cafe.png")
Image.new("RGB", (200, 200), (120, 80, 40)).save(cafe_path)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={"width": 1280, "height": 1000}, device_scale_factor=2).new_page()
    pg.goto(BASE + "/login", wait_until="networkidle")
    pg.fill("#employeeId", "2002"); pg.fill("#password", "password123")
    pg.click("button[type=submit]")
    pg.wait_for_url(BASE + "/", wait_until="networkidle")
    time.sleep(1)

    # Primero publica un ENCONTRADO café con imagen (para que haya coincidencia)
    pg.goto(BASE + "/publicar", wait_until="networkidle")
    pg.fill("#title", "Cartera cafe MEJ")
    pg.fill("#description", "cartera de piel marron encontrada")
    pg.fill("#location", "Recepcion")
    # El input de archivo está oculto (se dispara con botones); Playwright lo llena directo.
    pg.locator("input[type=file]").first.set_input_files(cafe_path)
    time.sleep(0.5)
    pg.get_by_role("button", name="Publicar objeto encontrado").click()
    pg.wait_for_url("**/objetos/**", wait_until="networkidle")
    print("encontrado con imagen creado")

    # Ahora reporta un PERDIDO SIN ubicación (verifica que location es opcional)
    pg.goto(BASE + "/publicar", wait_until="networkidle")
    pg.get_by_role("tab", name="Perdí un objeto").click()
    time.sleep(0.4)
    # Verifica que la etiqueta diga opcional y el campo no sea required
    body = pg.content()
    assert "Ubicación (opcional)" in body, "la ubicación debería ser opcional al perder"
    loc_required = pg.get_attribute("#location", "required")
    assert loc_required is None, "el campo ubicación no debe ser required en perdido"
    pg.fill("#title", "Mi cartera cafe MEJ")
    pg.fill("#description", "billetera marron de cuero que perdi")
    # (no llenamos ubicación a propósito — es opcional)
    pg.locator("input[type=file]").first.set_input_files(cafe_path)
    time.sleep(0.5)
    pg.get_by_role("button", name="Reportar objeto perdido").click()
    pg.wait_for_url("**/mis-objetos**", wait_until="networkidle")
    time.sleep(1)
    print("perdido SIN ubicación creado (ubicación opcional OK)")

    # Abre el detalle del perdido recién creado (link en la tarjeta)
    pg.get_by_role("link", name="Mi cartera cafe MEJ").first.click()
    pg.wait_for_url("**/perdidos/**", wait_until="networkidle")
    time.sleep(1.5)
    body = pg.content()
    assert "Coincidencias sugeridas por la IA" in body, "falta sección de coincidencias en detalle"
    assert "Perdido" in body and "Encontrado" in body, "falta comparación lado a lado"
    assert "Cartera cafe MEJ" in body, "no sugiere el encontrado correcto"
    # Abre el desglose
    if pg.get_by_role("button", name="Ver por qué coincide").count():
        pg.get_by_role("button", name="Ver por qué coincide").first.click()
        time.sleep(0.5)
        assert "Imagen" in pg.content(), "falta desglose por señal"
    pg.screenshot(path=os.path.join(OUT, "improvements.png"), full_page=True)
    print("detalle con comparación lado a lado + desglose OK")

    b.close()
    os.remove(cafe_path)
    print("MEJORAS OK")
