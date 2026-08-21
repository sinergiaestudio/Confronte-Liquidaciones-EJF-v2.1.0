# Historial de cambios

## 2.1.0 — 2026-08-21

### Ejecuciones especiales

- El escenario de cálculo se determina a partir de ambos documentos; una liquidación especial ya no puede degradarse a ejecución estándar por una constancia incompleta.
- Restauración del desarrollo de capitalización por comprobantes, capitalización por posiciones y deuda única.
- Separación del resarcitorio, punitorio previo, total capitalizado y punitorio posterior sobre la base capitalizada.
- Las filas de una liquidación especial gobiernan su desarrollo matemático, sin duplicar bases por lecturas parciales de la constancia.

### Trazabilidad y presentación

- Resumen general pormenorizado y desplegable con fechas, componentes informados, calculados y diferencias.
- Detalle desplegable por posición con capital, intereses, total y todos los tramos de tasa.
- Formato monetario argentino uniforme, siempre con centavos (`$153.000,22`).
- Eliminación de CUIT y razón social de la extracción, revisión y confrontación.

## 2.0.0 — 2026-08-21

### Nueva arquitectura

- Migración del HTML monolítico a React, TypeScript y módulos de dominio.
- Separación de extracción PDF, OCR, clasificación, parsing, confrontación y cálculo.
- Proyecto publicable con build reproducible, CI y pruebas automatizadas.

### Lectura documental

- Extracción con `pdf.js` y reconstrucción por coordenadas.
- OCR local en español para documentos escaneados.
- Perfiles AGIP estándar, AGIP histórico, capitalización por facturas, capitalización por posiciones y deuda única.
- Reparación trazable de continuaciones verticales y cuotas históricas anómalas.
- Acción explícita para releer cualquier documento con OCR.
- Recuperación de renglones faltantes desde el documento contraparte, sin inventar intereses.

### Control y cálculo

- Validación cruzada de tipo documental, adjudicación y certificado.
- Claves canónicas para comprobantes con prefijos heterogéneos.
- Trazabilidad de cada tramo resarcitorio y punitorio.
- Corrección de la tasa del primer semestre de 2026 e incorporación del segundo semestre.
- Cobertura cerrada al 31/12/2026 y bloqueo de extrapolaciones.
- Tolerancia operativa del 5% informada en pantalla.

### Experiencia y privacidad

- Flujo en tres etapas: cargar, revisar y confrontar.
- Grillas editables, niveles de confianza e inferencias visibles.
- Exportación CSV, sesión JSON e impresión.
- PWA instalable, con motor OCR incluido y funcionamiento offline luego de la primera carga.
- Procesamiento de PDFs completamente local.
