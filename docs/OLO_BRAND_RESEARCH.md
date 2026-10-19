# Investigación de marca — OLO (Overseas Logistics Operations)

> Investigación realizada para alinear la identidad visual de **Lost and Found** con la
> marca de OLO. Fecha: 2026-10-19. Todo lo marcado como "verificado" procede de fuentes
> oficiales públicas; lo que no pudo confirmarse está señalado explícitamente en §8.

---

## 1. Fuentes consultadas

| # | Fuente | URL | Qué aportó |
|---|--------|-----|-----------|
| 1 | Sitio oficial OLO | https://www.ologistics.com/ | Marca correcta, logo, colores, tipografía |
| 2 | "Quiénes somos" | https://www.ologistics.com/quienes-somos/ | Historia (fundada 2011), nombre completo |
| 3 | Servicios | https://www.ologistics.com/servicios/ | Catálogo de servicios logísticos |
| 4 | ConnectAmericas | https://connectamericas.com/es/company/overseas-logistics-operations | Perfil: 4PL, zona franca Costa Rica, ISO/OEA/BASC |
| 5 | ZoomInfo | https://www.zoominfo.com/c/overseas-logistics-operations-sa/466710074 | Confirmación de giro (inventario, cadena de suministro) |
| 6 | Logo oficial (SVG) | https://www.ologistics.com/wp-content/uploads/2025/06/logo-olo.svg | Colores HEX exactos del logo |
| 7 | Favicon oficial (SVG) | https://www.ologistics.com/wp-content/uploads/2025/06/Favicon-OLO.svg | Ícono de marca |

**Verificación de identidad**: el dominio oficial es **ologistics.com**, que coincide con
el dominio de correo corporativo proporcionado (`@ologistics.com`). Esto confirma que la
empresa objetivo es **OLO = Overseas Logistics Operations**, empresa de soluciones
logísticas de Costa Rica / Centroamérica (zona franca, 4PL, fundada en 2011).

**Homónimos descartados** (NO son esta empresa):
- *Orange Logistics Organization* — olofamily.com (red de agentes de carga internacional).
- *合同会社OLO* — olo-olo.jp (empresa japonesa de comercio exterior).
- Cualquier otra que use las siglas "OLO".

---

## 2. Elementos de identidad corporativa identificados

- **Nombre comercial**: OLO — Soluciones Logísticas (Overseas Logistics Operations).
- **Sector**: logística integral 4PL, almacenamiento en zona franca, gestión de inventario,
  preparación de pedidos, transporte y distribución.
- **Tono de marca**: profesional, confiable, orientado a precisión operativa (el sitio
  destaca métricas como "99,9% exactitud en recepción", "100% precisión de inventario").
- **Logotipo**: wordmark "OLO" en el que la tercera letra (la segunda "O") se representa
  como un **cuadrado sólido verde**, y el resto del texto en un tono casi negro.
- **Plataforma web**: WordPress con el tema "betheme".

---

## 3. Colores corporativos (VERIFICADOS)

Extraídos directamente del logotipo oficial SVG y del HTML del sitio.

| Rol | HEX | Origen | Notas |
|-----|-----|--------|-------|
| Verde de marca (primario) | `#00a785` | Logo oficial SVG (`fill:#00a785`) | Color principal de OLO |
| Verde claro (variante) | `#4ab397` | Inline en el home del sitio | Variante más suave del verde |
| Casi negro (texto de marca) | `#251e1f` | Logo oficial SVG (`fill:#251e1f`) | Texto del wordmark |
| Grises de fondo | `#eaecee`, `#e9eef2` | Inline en el sitio | Fondos y separadores suaves |
| Blanco | `#ffffff` | Inline | Fondos de contenido |

**Paleta derivada para la app** (escala construida alrededor del verde verificado `#00a785`,
para tener tonos de apoyo accesibles sin inventar colores de marca nuevos):

```
olo-50  #e6f7f2   olo-300 #4ab397 (variante verificada del sitio)
olo-100 #c0ebe0   olo-400 #1cb692
olo-200 #8fd9c7   olo-500 #00a785 (MARCA verificada)
                  olo-600 #008f72
                  olo-700 #00745d
                  olo-800 #005a48
                  olo-900 #00392e
ink     #251e1f (texto de marca verificado)
```

---

## 4. Logotipos y recursos oficiales disponibles

| Recurso | Ubicación original | Copia en el repo |
|---------|--------------------|------------------|
| Logo OLO (SVG, vectorial) | https://www.ologistics.com/wp-content/uploads/2025/06/logo-olo.svg | `frontend/src/assets/logo-olo.svg` |
| Favicon OLO (SVG) | https://www.ologistics.com/wp-content/uploads/2025/06/Favicon-OLO.svg | `frontend/public/favicon-olo.svg` |

Ambos son SVG oficiales, de buena calidad y recientes (subidos en 2025). Al ser vectoriales
escalan sin pérdida, lo que los hace idóneos para la interfaz.

> Nota de uso: el logo es un activo de marca de OLO. Su uso aquí es para una herramienta
> interna de la propia empresa. Si existe una guía de marca interna con reglas de uso
> (márgenes, versiones monocromas, usos prohibidos), debería incorporarse.

---

## 5. Tipografía (VERIFICADA)

El sitio oficial carga desde Google Fonts:
- **Open Sans** (principal: pesos 300, 400, 500, 700, 800) — texto y cuerpo.
- **Roboto** (secundaria: pesos 300, 400, 500, 900).

Ambas son gratuitas (Google Fonts) y de uso libre, por lo que pueden integrarse en
Lost and Found sin problemas de licencia. Se adopta **Open Sans** como fuente principal de
la app para coincidir con la marca, con fallback del sistema.

---

## 6. Referencias de diseño observadas en la experiencia digital de OLO

Del sitio ologistics.com (su principal presencia digital pública):
- **Jerarquía visual** sobria: fondos claros, bloques bien separados, acentos en verde.
- **Presentación de datos con métricas destacadas** (cifras grandes + etiqueta corta):
  patrón directamente aplicable al panel de administración de Lost and Found.
- **Uso del verde como color de acción/acento** sobre fondos neutros, no como fondo masivo.
- **Estética limpia y corporativa**, sin exceso de adornos ni animaciones.

No se identificaron aplicaciones móviles ni portales internos públicos de OLO (ver §8).

---

## 7. Recomendaciones aplicadas a Lost and Found

1. **Color de marca** `#00a785` como primario para acciones, enlaces y acentos (reemplaza
   el azul genérico anterior). Escala `olo-*` centralizada en tokens.
2. **Texto base** en el casi negro de marca `#251e1f` sobre fondos neutros claros.
3. **Logo oficial** en la barra de navegación y en la pantalla de inicio de sesión.
4. **Tipografía Open Sans** vía Google Fonts, con fallback del sistema.
5. **Panel admin** con tarjetas de métricas grandes, inspiradas en cómo OLO presenta sus
   indicadores de precisión.
6. **Colores de estado funcionales independientes de la marca** para no confundir:
   - Ámbar para pendiente/reclamado, verde *neutro* (no el de marca) para éxito/devuelto/
     aprobado, rojo para rechazado/error, gris para archivado/cancelado.
   - El verde de marca se reserva para acciones y navegación, no para estados, evitando
     ambigüedad entre "botón de OLO" y "estado devuelto".

---

## 8. Información NO verificable (declarado explícitamente)

- **Guía de marca oficial** (manual de identidad, tipografías exactas de impresos,
  variantes del logo, márgenes de seguridad): no es pública. Se usó el logo SVG del sitio
  como fuente de verdad para los colores.
- **Aplicaciones móviles / portales internos de OLO**: no se encontraron públicamente, por
  lo que no se pudieron analizar patrones de UI propios de OLO más allá de su sitio web.
- **Secundarios/terciarios de marca** más allá del verde y el casi negro: el sitio usa
  grises neutros estándar; la escala `olo-*` es una **derivación** del verde verificado,
  no una paleta oficial documentada. Marcada como propuesta ajustable.

**Si se proporciona** una guía de marca interna, el logo en otras variantes o capturas de
herramientas internas de OLO, se afinarán los tokens (`frontend/src/index.css` y
`frontend/tailwind.config.js`) sin reescribir la arquitectura del sistema de diseño.
