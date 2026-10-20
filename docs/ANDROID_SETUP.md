# Android — Guía de configuración (Capacitor)

**Lost and Found** se empaqueta como app Android con [Capacitor](https://capacitorjs.com).
Esta guía explica por qué se eligió Capacitor, cómo está montado el proyecto y cómo
compilar y ejecutar la app en un emulador o en un teléfono real.

> **Importante / honestidad técnica:** en este entorno de desarrollo **no** hay un JDK ni
> `ANDROID_HOME` configurados en el PATH, por lo que **la app no ha sido compilada ni
> instalada ni probada en un dispositivo** desde aquí. Lo que sí se ha verificado:
> el proyecto nativo `android/` se generó correctamente, los 3 plugins de Capacitor se
> detectan, y `npm run build` + `npx cap sync android` copian el build web sin errores.
> Los pasos de compilación de abajo requieren Android Studio / JDK instalados por ti.

---

## 1. Por qué Capacitor (y no React Native / Expo)

El frontend ya es una app web React + Vite + TypeScript completa y pulida (identidad OLO,
modo oscuro, mobile-first). Las opciones evaluadas:

| Opción | Reutiliza el frontend actual | Esfuerzo | Veredicto |
|---|---|---|---|
| **Capacitor** | Sí, casi al 100% (envuelve la web en una WebView nativa) | Bajo | **Elegida** |
| React Native | No, UI a reescribir con componentes nativos | Alto | Descartada |
| Expo | No, misma reescritura que RN | Alto | Descartada |

Capacitor envuelve el build web en un contenedor nativo y expone APIs del dispositivo
(cámara, teclado, barra de estado, botón atrás) vía plugins. Reescribir en React Native
tiraría a la basura todo el trabajo de UI ya hecho sin aportar valor para una app interna.

---

## 2. Qué hay en el repositorio

- `frontend/capacitor.config.ts` — configuración (appId `com.olo.lostandfound`,
  appName "Lost & Found OLO", `webDir: dist`, color de fondo, StatusBar/Keyboard, y
  `server.url` opcional para live-reload vía la variable `CAP_SERVER_URL`).
- `frontend/android/` — proyecto nativo Android generado por `npx cap add android`.
  Su propio `.gitignore` excluye artefactos de build (`*.apk`, `*.aab`, `build/`,
  `.gradle/`), `local.properties` (ruta del SDK) y los assets web copiados.
- `frontend/src/lib/native.ts` — puente nativo: inicializa StatusBar (verde OLO),
  Keyboard y el botón físico **atrás** de Android. En web es un *no-op*.
- Plugins instalados: `@capacitor/core`, `@capacitor/app`, `@capacitor/status-bar`,
  `@capacitor/keyboard`.

### Scripts npm (en `frontend/package.json`)

```bash
npm run build:mobile   # build web + cap sync android
npm run cap:sync       # copia el último build a android/
npm run cap:open       # abre el proyecto en Android Studio
```

---

## 3. Requisitos para compilar

1. **Android Studio** (incluye el Android SDK y el emulador).
   Descarga: https://developer.android.com/studio
2. **JDK 17+** (Android Studio trae uno embebido; si compilas por CLI, configúralo).
3. Variable de entorno **`ANDROID_HOME`** apuntando al SDK
   (por defecto en Windows: `%LOCALAPPDATA%\Android\Sdk`).
4. Un archivo `frontend/android/local.properties` con la ruta del SDK
   (Android Studio lo crea solo al abrir el proyecto):
   ```properties
   sdk.dir=C\:\\Users\\<tu-usuario>\\AppData\\Local\\Android\\Sdk
   ```

---

## 4. Ejecutar en un emulador

```bash
cd frontend
npm run build          # genera dist/
npx cap sync android   # copia dist/ al proyecto nativo
npx cap open android   # abre Android Studio
```

En Android Studio: crea/selecciona un emulador (AVD) y pulsa **Run ▶**. La app se
compila e instala en el emulador.

Alternativa por CLI (si tienes el SDK y JDK en el PATH):

```bash
cd frontend/android
./gradlew installDebug   # compila e instala el APK debug en el dispositivo/emulador activo
```

---

## 5. Ejecutar en un teléfono real

1. En el teléfono: activa **Opciones de desarrollador** y **Depuración USB**.
2. Conéctalo por USB y acepta la huella de depuración.
3. En Android Studio aparecerá como dispositivo destino; pulsa **Run ▶**.
4. **Backend accesible:** una app en el teléfono no puede usar `localhost`. Configura
   `VITE_API_BASE_URL` (en `frontend/.env`) con una URL alcanzable desde el móvil
   (IP de tu PC en la red local, o un backend desplegado), y reconstruye con
   `npm run build:mobile`.

### Live-reload durante el desarrollo

Para iterar sin recompilar el APK cada vez:

```bash
# PC y teléfono en la misma red. Averigua la IP local del PC.
set CAP_SERVER_URL=http://192.168.1.50:5173   # (PowerShell: $env:CAP_SERVER_URL="...")
npx cap sync android
# Arranca Vite:  npm run dev   y corre la app desde Android Studio.
```

---

## 6. Build de release (firmado)

Para generar un APK/AAB de producción:

1. Crea un **keystore** de firma (`keytool -genkey ...`). Guárdalo fuera del repo.
2. Configura la firma en `android/app/build.gradle` (bloque `signingConfigs`) o vía
   `gradle.properties` local (no lo subas: contiene contraseñas).
3. Compila:
   ```bash
   cd frontend/android
   ./gradlew assembleRelease   # APK
   ./gradlew bundleRelease     # AAB para Google Play
   ```

> Los keystores y contraseñas **nunca** van al repositorio.

---

## Checklist de pasos manuales pendientes

- [ ] Instalar Android Studio + SDK + JDK 17.
- [ ] Definir `ANDROID_HOME` y dejar que Android Studio cree `local.properties`.
- [ ] `npm run build:mobile` y abrir con `npm run cap:open`.
- [ ] Probar en emulador y en teléfono real.
- [ ] Configurar `VITE_API_BASE_URL` a un backend alcanzable desde el móvil.
- [ ] Para publicar: crear keystore, configurar firma y generar AAB de release.
