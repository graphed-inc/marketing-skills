import {
  AlertCircle, ArrowLeft, ArrowUpDown, Braces, Building2, Check, ChevronDown, ChevronLeft, ChevronRight,
  Coins, Copy, Download, Eye, EyeOff, Filter, Globe, Layers, LoaderCircle, Mail, MapPin, MoreHorizontal,
  Pencil, Phone, Plus, RefreshCw, Search, Sparkles, Square, Table, Trash2, Type, Upload, User, Users, Wrench, X, Zap,
} from "lucide-react";
import type { SVGProps } from "react";
import type { IconName } from "./types";

function FormulaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

const ICONS: Record<IconName, typeof Plus> = {
  plus: Plus,
  search: Search,
  upload: Upload,
  download: Download,
  users: Users,
  more: MoreHorizontal,
  table: Table,
  x: X,
  text: Type,
  formula: FormulaIcon as typeof Plus,
  enrich: Zap,
  waterfall: Layers,
  ai: Sparkles,
  http: Globe,
  alert: AlertCircle,
  play: Plus,
  chev: ChevronDown,
  refresh: RefreshCw,
  trash: Trash2,
  loader: LoaderCircle,
  check: Check,
  back: ArrowLeft,
  pencil: Pencil,
  copy: Copy,
  sort: ArrowUpDown,
  left: ChevronLeft,
  right: ChevronRight,
  stop: Square,
  braces: Braces,
  coins: Coins,
  mail: Mail,
  phone: Phone,
  building: Building2,
  user: User,
  wrench: Wrench,
  filter: Filter,
  eye: Eye,
  eyeoff: EyeOff,
  map: MapPin,
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  if (name === "play") {
    return (
      <svg className={`i ${className}`.trim()} viewBox="0 0 24 24">
        <polygon points="6 3 20 12 6 21 6 3" />
      </svg>
    );
  }
  const Cmp = ICONS[name];
  return <Cmp className={`i ${className}`.trim()} strokeWidth={2} />;
}
