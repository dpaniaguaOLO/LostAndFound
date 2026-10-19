"""Verifica la búsqueda visual end-to-end por la API:
crea un encontrado y un perdido con imágenes parecidas (y una distinta como control)
y comprueba que la coincidencia refleja la señal visual.
"""
import io, sys, json, urllib.request
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from PIL import Image

BASE = "http://localhost:4000/api"


def make_png(color, size=(200, 200)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def login(emp, pw):
    data = json.dumps({"employeeId": emp, "password": pw}).encode()
    r = urllib.request.Request(BASE + "/auth/login", data=data, method="POST")
    r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r))["token"]


def post_multipart(path, token, fields, img_bytes, img_name="image.png"):
    boundary = "----lafboundary1234"
    parts = []
    for k, v in fields.items():
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n")
    body = "".join(parts).encode()
    body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{img_name}\"\r\n"
             f"Content-Type: image/png\r\n\r\n").encode()
    body += img_bytes + f"\r\n--{boundary}--\r\n".encode()
    r = urllib.request.Request(BASE + path, data=body, method="POST")
    r.add_header("Authorization", f"Bearer {token}")
    r.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    return json.load(urllib.request.urlopen(r))


def get(path, token):
    r = urllib.request.Request(BASE + path, method="GET")
    r.add_header("Authorization", f"Bearer {token}")
    return json.load(urllib.request.urlopen(r))


tok = login("2002", "password123")

# Encontrado con imagen CAFÉ (simula una cartera café)
found = post_multipart("/found-items", tok, {
    "title": "Cartera cafe VIS", "description": "cartera de piel marron",
    "category": "WALLET", "location": "Recepcion",
    "foundAt": "2026-10-19T12:00:00.000Z",
}, make_png((120, 80, 40)))
print("encontrado creado:", found["id"], "sig?", bool(found.get("imageUrl")))

# Encontrado control con imagen NEGRA (simula teléfono negro)
found2 = post_multipart("/found-items", tok, {
    "title": "Telefono negro VIS", "description": "celular negro",
    "category": "ELECTRONICS", "location": "Cafeteria",
    "foundAt": "2026-10-19T12:00:00.000Z",
}, make_png((12, 12, 12)))
print("encontrado control:", found2["id"])

# Perdido con imagen CAFÉ parecida a la cartera
lost = post_multipart("/lost-reports", tok, {
    "title": "Perdi mi cartera VIS", "description": "billetera marron de cuero",
    "category": "WALLET", "location": "Recepcion",
    "lostAt": "2026-10-19T12:00:00.000Z",
}, make_png((128, 86, 44)))
print("perdido creado:", lost["id"])

# Sugerencias de coincidencia para el perdido
res = get(f"/ai/match/{lost['id']}", tok)
print("\n--- sugerencias ---")
top = None
for s in res["suggestions"]:
    if top is None:
        top = s
    print(f"  [{s['score']}%] {s['item']['title']} -> {', '.join(s['reasons'])}")

assert top is not None, "no hubo sugerencias"
assert top["item"]["title"] == "Cartera cafe VIS", "la cartera café debe ser la mejor coincidencia"
assert "Imagen parecida" in top["reasons"], "debe reconocer la señal visual 'Imagen parecida'"
print("\nVISUAL OK: la imagen parecida elevó la coincidencia correcta")

# Limpieza
import urllib.error
def delete_ids():
    # No hay endpoint DELETE; se limpia desde un script de node aparte.
    pass
print("IDS_PARA_LIMPIAR", found["id"], found2["id"], lost["id"])
