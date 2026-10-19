"""Genera actividad de demostración vía API para que las capturas no salgan vacías.
Crea una reclamación del empleado sobre un objeto del admin y la deja pendiente,
lo que produce una notificación para el admin. Idempotente en lo posible.
"""
import json
import urllib.request

BASE = "http://localhost:4000/api"


def req(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def login(employee_id, pw):
    _, d = req("POST", "/auth/login", body={"employeeId": employee_id, "password": pw})
    return d["token"]


emp = login("2002", "password123")
adm = login("1001", "password123")

# Objeto publicado por el admin (llaves) para que el empleado lo reclame.
_, items = req("GET", "/found-items", token=emp)
target = next((i for i in items["data"] if "llaves" in i["title"].lower()), items["data"][0])

# Crea reclamación del empleado (si no hay una pendiente ya).
status, claim = req(
    "POST", "/claims", token=emp,
    body={"foundItemId": target["id"], "message": "Son mis llaves con el llavero rojo, las perdi el martes."},
)
print("claim:", status, claim.get("status", claim.get("message")))

print("Datos de demo listos.")
