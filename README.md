# Confronte de Liquidaciones EJF

Aplicación web para comparar constancias de deuda y liquidaciones mandatarias, revisar la lectura de los PDFs y recalcular intereses con trazabilidad por período.

**Aplicación en línea:** [confronte-liquidaciones-ejf.arielmarcelogomez7.chatgpt.site](https://confronte-liquidaciones-ejf.arielmarcelogomez7.chatgpt.site)

> Herramienta de asistencia para el control judicial. No reemplaza la revisión profesional ni constituye un sistema oficial del Consejo de la Magistratura de la CABA.

## Qué cambió en la versión 2

La versión histórica concentraba interfaz, lectura binaria de PDF, reglas de negocio y exportación en un único HTML. La nueva versión separa esas responsabilidades y reemplaza la reconstrucción artesanal del PDF por una canalización verificable:

1. `pdf.js` extrae texto y coordenadas.
2. La aplicación reconstruye renglones por posición visual.
3. Un clasificador selecciona el perfil documental.
4. Un parser específico normaliza metadatos y deuda.
5. La grilla editable distingue lectura, inferencia y confirmación humana.
6. El confronte controla identidad, integridad nominal y cálculo.

Los PDFs se procesan dentro del navegador. No se envían a un servidor.

## Funciones principales

- lectura local de PDFs con capa de texto;
- detección automática de PDFs escaneados;
- OCR en español, íntegramente empaquetado en la aplicación;
- revisión y corrección de metadatos y renglones;
- recuperación explícita de filas desde el documento contraparte;
- controles de correspondencia por adjudicación, certificado y estructura de la deuda;
- normalización de posiciones y comprobantes;
- reconocimiento de ejecuciones especiales desde cualquiera de los dos documentos;
- recálculo estándar, capitalización por comprobantes o posiciones y deuda única;
- resumen general y desarrollo desplegable por posición y por tramo;
- importes con centavos y formato argentino (`$153.000,22`);
- tolerancia operativa visible del 5%;
- bloqueo cuando las tasas no cubren todo el período;
- sesión JSON, CSV e informe imprimible;
- PWA instalable y disponible sin conexión después de la primera carga.

## Perfiles documentales

| Perfil | Constancia | Liquidación | Control principal |
|---|---:|---:|---|
| AGIP estándar | Sí | Sí | Posición, vencimiento y capital |
| AGIP histórica | Sí | Sí | Cuotas partidas, continuaciones verticales y OCR defectuoso |
| Capitalización por facturas | Sí | Sí | Comprobante canónico, mora y capital |
| Capitalización por posiciones | Sí | Sí | Posición y base capitalizada |
| Deuda única / cálculo combinado | Sí | Sí | Capital, fechas y tramos resarcitorio/punitorio |

Los identificadores de facturas conservan su valor original para exhibición, pero se comparan mediante una clave canónica. Por ejemplo, `FACB2 0002 - 00000424` y `FACASIB-424` se confrontan como `FAC-424`.

## Privacidad y evidencia

- Los PDFs permanecen en memoria local y nunca forman parte de una petición de red.
- No hay base de datos, cuentas de usuario ni almacenamiento remoto de casos.
- La sesión JSON no incluye el archivo PDF, pero sí puede incluir datos extraídos; debe tratarse como información sensible.
- Los PDFs reales usados para aceptación no se incluyen en el repositorio.
- Las pruebas versionadas utilizan solamente datos sintéticos.

## Cálculo de intereses

La fórmula implementada para cada tramo es:

`interés = capital × tasa mensual × días / 30`

El resultado muestra fechas, días, tasa mensual e importe de cada tramo. La cobertura vigente del motor termina el **31/12/2026**; la aplicación no extrapola tasas futuras.

En las ejecuciones especiales con capitalización, el desarrollo conserva las cuatro etapas del cálculo:

1. resarcitorio sobre el capital original, desde el día posterior a la mora hasta el inicio del juicio inclusive;
2. punitorio previo sobre el capital original, desde el día posterior al inicio del juicio hasta la notificación de demanda inclusive;
3. capitalización de capital, resarcitorio y punitorio previo;
4. punitorio posterior sobre el total capitalizado, desde el día posterior a la notificación hasta la fecha de liquidación inclusive.

El resumen general compara cada componente calculado con el informado. El detalle por posición expone, además, todos los tramos, días, tasas e importes utilizados.

La regla general desde 2023 surge de la [Resolución 4323/MHFGC/2022](https://www.agip.gob.ar/normativa/resoluciones/2022/mhfgc/resolucion-n-4323-mhfgc--2022) y de la [Resolución 360/AGIP/2022](https://boletinoficial.buenosaires.gob.ar/normativaba/norma/615104). Las tasas están aisladas en `lib/confronte/rates.ts` para facilitar su revisión y actualización.

## Arquitectura

```text
app/
  components/       interfaz, carga, revisión y resultados
lib/
  pdf/              extracción por coordenadas y OCR local
  parsers/          clasificación y parsers documentales
  domain/           tipos, fechas, importes y normalización
  confronte/        emparejamiento, tasas y cálculo
public/
  ocr/              worker, núcleo WASM y modelo español
tests/              regresiones con fixtures sintéticos
scripts/            auditoría opcional de corpus local
```

## Desarrollo

Requisitos: Node.js 22.13 o posterior.

```bash
npm ci
npm run dev
```

Comandos de control:

```bash
npm run lint
npm test
npm run audit:pdf -- /ruta/local/a/pdfs
```

`audit:pdf` imprime únicamente perfil, cantidad de filas, confianza y bloqueos. No modifica los PDFs ni genera fixtures con datos reales.

## Criterio de aceptación

Antes de publicar se exige:

- TypeScript sin errores;
- lint sin observaciones;
- pruebas de normalización, perfiles, identidad, tasas y cobertura;
- build de producción;
- auditoría local contra el corpus de referencia, sin incorporarlo al repositorio.

## Autoría

Diseño y desarrollo: **Marcelo Gómez** · innovación aplicada a la gestión judicial.
