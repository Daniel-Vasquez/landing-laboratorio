import Activity from '@lucide/astro/icons/activity';
import HeartPulse from '@lucide/astro/icons/heart-pulse';
import Stethoscope from '@lucide/astro/icons/stethoscope';
import Microscope from '@lucide/astro/icons/microscope';
import Beaker from '@lucide/astro/icons/beaker';
import FlaskConical from '@lucide/astro/icons/flask-conical';
import TestTube from '@lucide/astro/icons/test-tube';
import Syringe from '@lucide/astro/icons/syringe';
import Droplet from '@lucide/astro/icons/droplet';
import Thermometer from '@lucide/astro/icons/thermometer';
import Dna from '@lucide/astro/icons/dna';
import Brain from '@lucide/astro/icons/brain';
import Bone from '@lucide/astro/icons/bone';
import Eye from '@lucide/astro/icons/eye';
import Ear from '@lucide/astro/icons/ear';
import Pill from '@lucide/astro/icons/pill';
import Baby from '@lucide/astro/icons/baby';
import Venus from '@lucide/astro/icons/venus';
import Mars from '@lucide/astro/icons/mars';
import Ribbon from '@lucide/astro/icons/ribbon';
import Bug from '@lucide/astro/icons/bug';
import ShieldCheck from '@lucide/astro/icons/shield-check';
import ShieldAlert from '@lucide/astro/icons/shield-alert';
import HandHeart from '@lucide/astro/icons/hand-heart';
import Hospital from '@lucide/astro/icons/hospital';
import Clock from '@lucide/astro/icons/clock';
import Timer from '@lucide/astro/icons/timer';
import Hourglass from '@lucide/astro/icons/hourglass';
import CalendarCheck from '@lucide/astro/icons/calendar-check';
import CalendarDays from '@lucide/astro/icons/calendar-days';
import ClipboardList from '@lucide/astro/icons/clipboard-list';
import ListChecks from '@lucide/astro/icons/list-checks';
import FileText from '@lucide/astro/icons/file-text';
import ScanLine from '@lucide/astro/icons/scan-line';
import CircleCheck from '@lucide/astro/icons/circle-check';
import BadgeCheck from '@lucide/astro/icons/badge-check';
import Award from '@lucide/astro/icons/award';
import Sparkles from '@lucide/astro/icons/sparkles';
import Zap from '@lucide/astro/icons/zap';
import BadgeDollarSign from '@lucide/astro/icons/badge-dollar-sign';
import Banknote from '@lucide/astro/icons/banknote';
import CreditCard from '@lucide/astro/icons/credit-card';
import Wallet from '@lucide/astro/icons/wallet';
import PiggyBank from '@lucide/astro/icons/piggy-bank';
import Users from '@lucide/astro/icons/users';
import MapPin from '@lucide/astro/icons/map-pin';
import Phone from '@lucide/astro/icons/phone';
import MessageCircle from '@lucide/astro/icons/message-circle';
import Truck from '@lucide/astro/icons/truck';
import Package from '@lucide/astro/icons/package';
import { ICON_NAMES, type IconName } from './names.ts';

/**
 * Mapa nombre -> componente `.astro`. SOLO lo importa la landing.
 *
 * Los imports son ESTÁTICOS a propósito: Lucide publica ~1.855 iconos y Astro
 * necesita imports estáticos para hacer tree-shaking. Un import dinámico por
 * nombre metería el catálogo entero en el build.
 *
 * Los metadatos (etiquetas, sinónimos, búsqueda) viven en `names.ts`, que sí
 * pueden importar el panel y los scripts sin arrastrar estos 50 componentes.
 */
export const ICON_COMPONENTS = {
  'activity': Activity,
  'heart-pulse': HeartPulse,
  'stethoscope': Stethoscope,
  'microscope': Microscope,
  'beaker': Beaker,
  'flask-conical': FlaskConical,
  'test-tube': TestTube,
  'syringe': Syringe,
  'droplet': Droplet,
  'thermometer': Thermometer,
  'dna': Dna,
  'brain': Brain,
  'bone': Bone,
  'eye': Eye,
  'ear': Ear,
  'pill': Pill,
  'baby': Baby,
  'venus': Venus,
  'mars': Mars,
  'ribbon': Ribbon,
  'bug': Bug,
  'shield-check': ShieldCheck,
  'shield-alert': ShieldAlert,
  'hand-heart': HandHeart,
  'hospital': Hospital,
  'clock': Clock,
  'timer': Timer,
  'hourglass': Hourglass,
  'calendar-check': CalendarCheck,
  'calendar-days': CalendarDays,
  'clipboard-list': ClipboardList,
  'list-checks': ListChecks,
  'file-text': FileText,
  'scan-line': ScanLine,
  'circle-check': CircleCheck,
  'badge-check': BadgeCheck,
  'award': Award,
  'sparkles': Sparkles,
  'zap': Zap,
  'badge-dollar-sign': BadgeDollarSign,
  'banknote': Banknote,
  'credit-card': CreditCard,
  'wallet': Wallet,
  'piggy-bank': PiggyBank,
  'users': Users,
  'map-pin': MapPin,
  'phone': Phone,
  'message-circle': MessageCircle,
  'truck': Truck,
  'package': Package,
} as const;

export { ICON_NAMES, type IconName };

/** Comprueba en build que el mapa cubre todos los nombres declarados. */
export function missingComponents(): IconName[] {
  return ICON_NAMES.filter((name) => !ICON_COMPONENTS[name]);
}
