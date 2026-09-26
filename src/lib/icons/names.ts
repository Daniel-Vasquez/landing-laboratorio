/**
 * Metadatos del catálogo de iconos: SOLO DATOS, sin componentes.
 *
 * Existe separado de `catalog.ts` por dos razones concretas:
 *
 *  1. `catalog.ts` importa 50 componentes de `@lucide/astro`. Si el panel lo
 *     importara para leer los nombres, arrastraría esos 50 componentes ADEMÁS
 *     de `lucide-react` — el doble de peso para mostrar una rejilla.
 *  2. `@lucide/astro` publica archivos `.ts` dentro de `node_modules`, y Node se
 *     niega a procesarlos (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), así
 *     que ningún script de `scripts/` podría importar el catálogo completo.
 *
 * Este módulo lo puede importar cualquiera: la landing, el panel y los scripts.
 */
export const ICON_META = {
  'activity': { label: 'Actividad', tags: 'salud pulso signos vitales monitoreo' },
  'heart-pulse': { label: 'Pulso cardiaco', tags: 'corazon cardiovascular colesterol lipidos' },
  'stethoscope': { label: 'Estetoscopio', tags: 'medico consulta revision doctor' },
  'microscope': { label: 'Microscopio', tags: 'laboratorio analisis muestra estudio' },
  'beaker': { label: 'Matraz', tags: 'laboratorio quimica reactivo' },
  'flask-conical': { label: 'Matraz cónico', tags: 'laboratorio quimica cultivo' },
  'test-tube': { label: 'Tubo de ensayo', tags: 'muestra sangre estudio analisis' },
  'syringe': { label: 'Jeringa', tags: 'sangre toma muestra vacuna' },
  'droplet': { label: 'Gota', tags: 'sangre orina muestra liquido' },
  'thermometer': { label: 'Termómetro', tags: 'fiebre temperatura' },
  'dna': { label: 'ADN', tags: 'genetica molecular marcador' },
  'brain': { label: 'Cerebro', tags: 'neurologico hormonal tiroides' },
  'bone': { label: 'Hueso', tags: 'oseo calcio densidad' },
  'eye': { label: 'Ojo', tags: 'vision oftalmologico revision' },
  'ear': { label: 'Oído', tags: 'audicion otorrino' },
  'pill': { label: 'Pastilla', tags: 'medicamento tratamiento farmaco' },
  'baby': { label: 'Bebé', tags: 'prenatal embarazo pediatrico maternidad' },
  'venus': { label: 'Símbolo femenino', tags: 'mujer ginecologico femenino' },
  'mars': { label: 'Símbolo masculino', tags: 'hombre masculino prostata' },
  'ribbon': { label: 'Listón', tags: 'oncologico cancer marcador tumoral' },
  'bug': { label: 'Microorganismo', tags: 'bacteria infeccion cultivo hongo' },
  'shield-check': { label: 'Escudo verificado', tags: 'seguridad confianza calidad garantia' },
  'shield-alert': { label: 'Escudo de alerta', tags: 'riesgo prevencion deteccion' },
  'hand-heart': { label: 'Mano con corazón', tags: 'cuidado atencion trato humano' },
  'hospital': { label: 'Hospital', tags: 'clinica instalaciones sede edificio' },
  'clock': { label: 'Reloj', tags: 'tiempo rapidez mismo dia espera horario' },
  'timer': { label: 'Cronómetro', tags: 'rapidez minutos entrega' },
  'hourglass': { label: 'Reloj de arena', tags: 'espera tiempo resultados' },
  'calendar-check': { label: 'Calendario con check', tags: 'cita agenda confirmado' },
  'calendar-days': { label: 'Calendario', tags: 'agenda fecha horario' },
  'clipboard-list': { label: 'Portapapeles', tags: 'orden receta indicaciones checklist' },
  'list-checks': { label: 'Lista con checks', tags: 'catalogo estudios variedad opciones' },
  'file-text': { label: 'Documento', tags: 'resultado reporte informe' },
  'scan-line': { label: 'Escaneo', tags: 'analisis deteccion lectura' },
  'circle-check': { label: 'Círculo con check', tags: 'confirmado listo sin complicaciones' },
  'badge-check': { label: 'Insignia verificada', tags: 'certificado acreditado cofepris' },
  'award': { label: 'Reconocimiento', tags: 'calidad premio excelencia' },
  'sparkles': { label: 'Destellos', tags: 'facil simple sin complicaciones nuevo' },
  'zap': { label: 'Rayo', tags: 'rapido inmediato express' },
  'badge-dollar-sign': { label: 'Insignia de precio', tags: 'precio costo accesible economico' },
  'banknote': { label: 'Billete', tags: 'pago efectivo precio' },
  'credit-card': { label: 'Tarjeta', tags: 'pago tarjeta credito debito' },
  'wallet': { label: 'Cartera', tags: 'pago presupuesto costo' },
  'piggy-bank': { label: 'Alcancía', tags: 'ahorro economico accesible' },
  'users': { label: 'Personas', tags: 'familia pacientes equipo personal' },
  'map-pin': { label: 'Ubicación', tags: 'direccion sede donde estamos' },
  'phone': { label: 'Teléfono', tags: 'contacto llamada telefono' },
  'message-circle': { label: 'Mensaje', tags: 'whatsapp contacto dudas orientacion' },
  'truck': { label: 'Camioneta', tags: 'domicilio traslado servicio' },
  'package': { label: 'Paquete', tags: 'check up paquete completo' },
} as const;

export type IconName = keyof typeof ICON_META;

export const ICON_NAMES = Object.keys(ICON_META) as IconName[];

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && value in ICON_META;
}

/** Icono de respaldo cuando el dato falta o no valida. Nunca se renderiza vacío. */
export const FALLBACK_ICON: IconName = 'activity';

/**
 * Búsqueda por etiqueta y sinónimos EN ESPAÑOL.
 *
 * Sin esto el buscador solo encontraría por el nombre técnico en inglés
 * (`heart-pulse`), y el administrador escribirá "corazon" o "rapidez".
 * Se normalizan los acentos para que "ubicacion" encuentre "Ubicación".
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function searchIcons(query: string): IconName[] {
  const q = normalize(query);
  if (q.length === 0) return ICON_NAMES;
  return ICON_NAMES.filter((name) => {
    const entry = ICON_META[name];
    return (
      name.includes(q) ||
      normalize(entry.label).includes(q) ||
      normalize(entry.tags).includes(q)
    );
  });
}
