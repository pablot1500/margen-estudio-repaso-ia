# Margen - Estudio y repaso con IA

Aplicación personal de estudio y repaso asistido por IA construida con React, TypeScript, Netlify Functions, Netlify Blobs y Groq.

## Límite de la versión pública

La versión productiva limita globalmente el uso de Groq a 5 solicitudes por cada ventana de 5 horas para proteger la cuota del modelo. El contador se persiste en Netlify Blobs con consistencia fuerte y escrituras condicionales para evitar que solicitudes simultáneas excedan el límite.

El límite sólo se activa cuando `CONTEXT=production`. Las ejecuciones locales y `netlify dev` permanecen sin límite.

## Ejecutar localmente

1. Copiar `.env.example` como `.env` y completar `GROQ_API_KEY`, `APP_PASSWORD` y `SESSION_SECRET`. Gemini queda como fallback temporal para PDF/DOCX.
2. Ejecutar:

```bash
npm install
npm run dev
```

3. Abrir [http://localhost:8888](http://localhost:8888).

El entorno local actual usa la contraseña `margen-local`. Cambiar `APP_PASSWORD` antes de publicar.

`npm run dev:ui` levanta sólo Vite y no permite usar autenticación, Blobs ni los proveedores de IA.

## Variables de entorno

```env
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
APP_PASSWORD=
SESSION_SECRET=
```

No crear variables `VITE_*` para estos valores. En producción deben configurarse desde Netlify con alcance de Functions; no se declaran en `netlify.toml`.

## Flujo

- Crear materias y subir TXT/Markdown no realiza ninguna llamada a Gemini.
- Los archivos se guardan de forma privada en Netlify Blobs y se organizan con `class_id` y `class_name`, lo que permite estudiar una, varias o todas las clases.
- El frontend limita cada archivo a 4 MB para mantenerse por debajo del límite efectivo de payload binario de una Function.
- Cada apunte debe incluir al final un bloque `# Preguntas`. Puede organizarse con apartados como `### 1. Tema` y `### Preguntas integradoras`; la numeración puede reiniciarse en cada apartado. La aplicación conserva apartado, orden y consigna, y nunca crea ni reformula preguntas.
- En TXT y Markdown la identificación es completamente local y determinística: los encabezados internos se separan de las consignas sin llamar a ningún modelo. En PDF y DOCX se mantiene temporalmente Gemini para leer el binario.
- Los archivos cargados antes de incorporar este flujo deben eliminarse y subirse nuevamente para guardar su original privado y extraer el bloque completo.
- Al eliminar una materia se borran sus apuntes privados, preguntas extraídas y repasos asociados; para materias antiguas también se limpia su File Search Store. La interfaz solicita confirmación porque la operación no se puede deshacer.
- El tamaño diario es `ceil(preguntas extraídas del alcance / 5)`.
- En TXT y Markdown las preguntas se guardan inmediatamente. Al responder, la aplicación elimina el banco final de preguntas y selecciona el apartado exacto del cuerpo; para preguntas integradoras elige hasta tres apartados por relevancia léxica. Groq corrige con ese contexto acotado usando `openai/gpt-oss-20b` y JSON Schema estricto.
- Si una identificación supera dos minutos, pasa a estado de error recuperable y puede reintentarse sin volver a subir el archivo.
- Una evaluación incorrecta produce `Falló` y mantiene la pregunta pendiente.
- Una evaluación parcial puede producir una única repregunta.
- La nota final es el promedio de las notas definitivas por pregunta.
- Las preguntas del día pueden regenerarse; el examen activo anterior queda archivado.

## Voz

`useSpeechRecognition` utiliza `SpeechRecognition` o `webkitSpeechRecognition` con `es-AR`. La transcripción nunca se envía automáticamente: siempre puede editarse antes de responder. En navegadores no compatibles, la respuesta escrita sigue funcionando. El hook deja separado el punto de extensión para un futuro fallback `MediaRecorder → /api/transcribe → Gemini`.

## Producción en Netlify

El proyecto ya incluye `netlify.toml`. Después de vincularlo con un proyecto de Netlify:

1. configurar las variables de entorno con alcance de Functions;
2. ejecutar un deploy;
3. comprobar `/api/health?ai=1` después de iniciar sesión;
4. crear una materia y subir un material pequeño de prueba.

Netlify Dev utiliza un sandbox local de Blobs: los datos creados localmente no son los datos de producción.
