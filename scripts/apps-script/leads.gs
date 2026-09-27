/**
 * Registro de leads de la landing del Laboratorio Clínico Hospital Cristal.
 *
 * Crea una pestaña por medio de contacto (WhatsApp, Correo, Llamada) y añade
 * una fila por lead con las columnas: nombre, correo, telefono, servicio,
 * medio, fecha.
 */

// Debe coincidir EXACTAMENTE con SHEETS_WEBHOOK_TOKEN en el proyecto.
// Genera uno con: openssl rand -hex 32
var TOKEN = 'PEGA_AQUI_TU_TOKEN';

var HEADERS = ['nombre', 'correo', 'telefono', 'servicio', 'medio', 'fecha'];

// El valor de `medio` que envía el sitio -> nombre de la pestaña.
var SHEETS = {
  whatsapp: 'WhatsApp',
  correo: 'Correo',
  llamada: 'Llamada'
};

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'Sin cuerpo en la petición' });
    }

    var body = JSON.parse(e.postData.contents);

    // La app web se despliega como "Cualquier persona", así que sin este
    // control cualquiera podría escribir en la hoja.
    if (body.token !== TOKEN) {
      return json({ ok: false, error: 'No autorizado' });
    }

    var nombreHoja = SHEETS[String(body.medio || '').toLowerCase()];
    if (!nombreHoja) {
      return json({ ok: false, error: 'Medio desconocido: ' + body.medio });
    }

    // Un solo escritor a la vez: dos leads simultáneos podrían pisarse la fila.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);

    try {
      var hoja = obtenerHoja(nombreHoja);
      hoja.appendRow([
        body.nombre || '',
        body.correo || '',
        body.telefono || '',
        body.servicio || '',
        body.medio || '',
        body.fecha || new Date().toISOString()
      ]);
    } finally {
      lock.releaseLock();
    }

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

/** Devuelve la pestaña, creándola con sus encabezados si no existe. */
function obtenerHoja(nombre) {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(nombre);

  if (!hoja) {
    hoja = libro.insertSheet(nombre);
  }

  if (hoja.getLastRow() === 0) {
    hoja.appendRow(HEADERS);
    hoja.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }

  return hoja;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Opcional: ejecútala una vez desde el editor para crear las tres pestañas. */
function inicializar() {
  for (var clave in SHEETS) {
    obtenerHoja(SHEETS[clave]);
  }
}
