import type { LandingContent } from './schemas.ts';

/**
 * Contenido semilla, transcrito de copy.md.
 *
 * Cumple dos funciones, no solo la de poblar la base:
 *   1. `scripts/seed.ts` lo inserta en MongoDB la primera vez.
 *   2. `repository.ts` lo usa como fallback cuando una sección no existe,
 *      está corrupta, o Atlas no responde durante el build. Así un incidente
 *      de base de datos degrada a contenido válido en lugar de romper el deploy.
 *
 * Al editar contenido en producción se debe usar el dashboard, NO este archivo:
 * el seed solo se aplica con `$setOnInsert`, así que no pisa ediciones.
 */

/**
 * `mode: 'form'` por defecto: los 8 CTA abren el formulario de captación.
 *
 * Resuelve además el enlace muerto registrado desde la Tanda 3: los ocho
 * apuntaban a `#agendar`, y el botón DENTRO de esa sección se enlazaba a sí
 * mismo. Como disparador del formulario, el problema desaparece.
 */
const CTA = { label: 'Agenda tu estudio', mode: 'form', href: '#agendar' } as const;

export const SEED: LandingContent = {
  hero: {
    headline:
      'La tranquilidad de saber que tu familia está bien empieza con un diagnóstico a tiempo',
    subheadline:
      'En el Laboratorio Clínico de Hospital Cristal cuidamos de quienes más amas con estudios precisos y seguros.',
    bullets: [
      'Entregamos resultados el mismo día que se realizan',
      'Realizamos más de 200 pruebas distintas',
      'Contamos con precios accesibles',
    ],
    address: 'Melchor Ocampo 233, Santiago 1ra Secc, Zumpango, Estado de México.',
    cta: { ...CTA },
  },

  estudios_principales: {
    eyebrow: 'Estudios principales',
    intro:
      'Estos son algunos de los estudios más solicitados en Hospital Cristal. Contamos con más de 200 estudios disponibles para cubrir cualquier necesidad médica.',
    estudios: [
      {
        nombre: 'Biometría hemática',
        descripcion:
          'Detecta anemia, infecciones y alteraciones en la sangre. Ofrece una visión general de tu estado de salud.',
      },
      {
        nombre: 'Química sanguínea',
        descripcion:
          'Evalúa función renal, glucosa y colesterol. Clave para detectar diabetes y riesgo cardiovascular a tiempo.',
      },
      {
        nombre: 'Examen general de orina',
        descripcion:
          'Detecta infecciones urinarias y problemas renales de forma rápida y confiable.',
      },
      {
        nombre: 'Hemoglobina glucosilada',
        descripcion:
          'Mide tu nivel promedio de azúcar en sangre de los últimos tres meses. Fundamental para el diagnóstico y control de la diabetes.',
      },
      {
        nombre: 'Perfil de lípidos',
        descripcion:
          'Evalúa colesterol total, HDL, LDL y triglicéridos. Esencial para revisar la salud cardiovascular.',
      },
      {
        nombre: 'Perfil tiroideo',
        descripcion:
          'Evalúa el funcionamiento de la tiroides, glándula que regula el metabolismo, el peso y la energía.',
      },
    ],
    cta: { ...CTA },
  },

  por_que_estudios: {
    eyebrow: '¿Por qué hacerte estudios de laboratorio?',
    intro:
      'Los estudios de laboratorio son la herramienta más efectiva para conocer tu estado de salud antes de que aparezcan los síntomas. Muchas enfermedades no presentan señales visibles en sus etapas iniciales, y cuando lo hacen, el daño ya es mayor.',
    datosLabel: 'Estos datos lo confirman:',
    datos: [
      'En México, la prevalencia nacional de diabetes tipo 2 es del 17%, y el 5.4% de los casos no está diagnosticado. Muchas personas la tienen sin saberlo.',
      'El 15.8% de las mujeres mexicanas en edad reproductiva tiene anemia, una condición que se detecta fácilmente con una biometría hemática.',
      'La prevalencia de enfermedad renal en México es de 12.2%, y en la mayoría de los casos se puede prevenir con detección oportuna.',
    ],
    cierre:
      'Detectar a tiempo marca la diferencia entre un tratamiento sencillo y una complicación mayor. Se recomienda realizarlos al menos una vez al año desde los 18 años.',
    cta: { ...CTA },
  },

  estudios_adicionales: {
    eyebrow: 'Estudios adicionales',
    intro:
      'Además de los estudios básicos, en Hospital Cristal contamos con una amplia variedad de estudios para cubrir cualquier necesidad médica:',
    items: [
      { titulo: 'Check ups completos', detalle: 'Básico, masculino, femenino y para control de diabetes' },
      { titulo: 'Perfiles prenatales', detalle: 'Para el seguimiento de tu embarazo' },
      { titulo: 'Perfiles tiroideos', detalle: 'Evaluación completa de la función de la tiroides' },
      { titulo: 'Perfiles hepáticos', detalle: 'Evaluación de la función del hígado' },
      { titulo: 'Perfiles renales', detalle: 'Evaluación completa de la función renal' },
      { titulo: 'Perfiles hormonales', detalle: 'Evaluación hormonal completa para hombres y mujeres' },
      { titulo: 'Perfiles ginecológicos', detalle: 'Estudios especializados para la salud femenina' },
      { titulo: 'Cultivos', detalle: 'Detección de infecciones bacterianas y hongos' },
      { titulo: 'Marcadores tumorales', detalle: 'Detección temprana de alteraciones oncológicas' },
      { titulo: 'Pruebas COVID', detalle: 'Antígeno rápido y PCR' },
      { titulo: 'Antidoping', detalle: 'Desde 3 hasta 7 pruebas' },
    ],
    cta: { ...CTA },
  },

  por_que_hospital: {
    eyebrow: '¿Por qué en Hospital Cristal?',
    beneficios: [
      {
        titulo: 'Resultados el mismo día',
        descripcion:
          'La mayoría de nuestros estudios tienen entrega el mismo día que se realizan. Sin esperas innecesarias.',
      },
      {
        titulo: 'Precisión en cada resultado',
        descripcion:
          'Contamos con tecnología y procesos de calidad para garantizarte resultados confiables en cada estudio.',
      },
      {
        titulo: 'Precios accesibles',
        descripcion: 'El costo no debe ser un obstáculo para cuidar tu salud.',
      },
      {
        titulo: 'Más de 200 estudios disponibles',
        descripcion:
          'Desde los más básicos hasta los más especializados, todo en un solo lugar.',
      },
      {
        titulo: 'Sin complicaciones',
        descripcion:
          'Para la mayoría de estudios no necesitas referencia médica. Solo agenda, preséntate con tu preparación y listo.',
      },
      {
        titulo: 'Dentro del hospital',
        descripcion:
          'Nuestro laboratorio está dentro de Hospital Cristal, por lo que si necesitas atención médica adicional tienes acceso inmediato a nuestros especialistas.',
      },
    ],
    cta: { ...CTA },
  },

  testimonios: {
    eyebrow: 'Lo que dicen nuestros pacientes',
    items: [
      {
        quote:
          'Costos razonables y muy buena atención tanto del personal administrativo como médico. Es un alivio encontrar todo lo que necesitas en un mismo lugar.',
        autor: 'Noel Colorado',
      },
      {
        quote:
          'Excelente atención. El personal es muy amable, resolvieron todas mis dudas y me hicieron sentir seguro en todo momento.',
        autor: 'Araa Gomez',
      },
      {
        quote:
          'El diagnóstico fue claro y puntual. Sin duda volveré para mis estudios anuales.',
        autor: 'Auri Ichitzer',
      },
    ],
    cta: { ...CTA },
  },

  videos: {
    eyebrow: 'Conócenos',
    intro: 'Mira cómo trabajamos en nuestro laboratorio.',
    // `thumbnail` vacío -> se renderiza un placeholder. Ver nota en Videos.astro:
    // NO se usa el script de embed de Instagram por su costo en performance.
    items: [
      { url: 'https://www.instagram.com/p/DWH64X2kbsa/', titulo: 'Nuestro laboratorio', thumbnail: '' },
      { url: 'https://www.instagram.com/p/DSTVfPsCXhw/', titulo: 'Resultados el mismo día', thumbnail: '' },
      { url: 'https://www.instagram.com/p/Da58_GTAEju/', titulo: 'Más de 200 estudios', thumbnail: '' },
      { url: 'https://www.instagram.com/p/Dbtna03DNv8/', titulo: 'Atención personalizada', thumbnail: '' },
      { url: 'https://www.instagram.com/p/DbWWTbrEaHV/', titulo: 'Tecnología y precisión', thumbnail: '' },
      { url: 'https://www.instagram.com/p/DaGQfS7lUuL/', titulo: 'Check ups completos', thumbnail: '' },
      { url: 'https://www.instagram.com/p/DYk-x6njKlK/', titulo: 'Dentro de Hospital Cristal', thumbnail: '' },
    ],
  },

  faq: {
    eyebrow: 'Preguntas frecuentes',
    items: [
      {
        pregunta: '¿Necesito una orden médica para hacerme estudios?',
        respuesta:
          'Para la mayoría de los estudios no necesitas referencia médica. Si tienes dudas sobre qué estudios realizarte, escríbenos y te orientamos.',
      },
      {
        pregunta: '¿Cuándo recibo mis resultados?',
        respuesta:
          'La mayoría de estudios tienen entrega el mismo día. Algunos estudios especializados como cultivos pueden tomar entre 3 y 30 días según el tipo.',
      },
      {
        pregunta: '¿Qué preparación necesito?',
        respuesta:
          'Depende del estudio. Al agendar tu cita te indicamos exactamente qué necesitas para garantizar la precisión de tus resultados.',
      },
      {
        pregunta: '¿Qué métodos de pago aceptan?',
        respuesta:
          'Aceptamos efectivo, tarjetas de crédito y débito (Visa y MasterCard) y transferencias bancarias.',
      },
      {
        pregunta: '¿Atienden sin cita?',
        respuesta:
          'Sí, pero te recomendamos agendar para garantizarte la atención en el horario que prefieras.',
      },
    ],
    cta: { ...CTA },
  },

  cta_final: {
    headline: 'Tu salud no puede esperar',
    body: 'Agenda tus estudios de laboratorio en Hospital Cristal y conoce tu estado de salud hoy. Resultados precisos el mismo día, precios accesibles y todo en un solo lugar.',
    cta: { ...CTA },
  },

  avisos: {
    permisoCofepris: '253300201A2234',
    items: [
      'Aviso de privacidad disponible al pie de página.',
      'Este sitio tiene fines informativos y no sustituye la valoración médica presencial.',
    ],
    privacidadHref: '/aviso-de-privacidad',
  },

  seo: {
    // copy.md propone 74 caracteres, por encima del límite del SERP.
    // El sufijo "| Hospital Cristal" lo agrega LandingLayout, así que aquí
    // se guarda solo la parte que debe sobrevivir al truncado.
    title: 'Laboratorio Clínico en Zumpango | Resultados el Mismo Día',
    description:
      'Laboratorio clínico completo en Zumpango de Ocampo. Más de 200 estudios con resultados precisos el mismo día y precios accesibles. Agenda hoy.',
    keywords: [
      'laboratorio clínico Zumpango',
      'estudios de laboratorio Zumpango',
      'biometría hemática Zumpango',
      'química sanguínea Zumpango',
      'examen de orina Zumpango',
      'perfil prenatal Zumpango',
      'Hospital Cristal Zumpango',
    ],
  },
};
