import {
  Shield,
  Swords,
  Crosshair,
  Target,
  Skull,
  Flame,
  Zap,
  Mountain,
  Compass,
  Radar,
  Rocket,
  Bomb,
  Axe,
  Trophy,
  Crown,
  Star,
  Hexagon,
  Triangle,
  Flag,
  Eye,
  Feather,
  Anchor,
  Bolt,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { TEAM_ICON_KEYS } from "@/lib/team-icons";
import { eventStyle } from "@/lib/presentation";

export const TEAM_ICONS: Record<(typeof TEAM_ICON_KEYS)[number], LucideIcon> = {
  shield: Shield,
  swords: Swords,
  crosshair: Crosshair,
  target: Target,
  skull: Skull,
  flame: Flame,
  zap: Zap,
  mountain: Mountain,
  compass: Compass,
  radar: Radar,
  rocket: Rocket,
  bomb: Bomb,
  axe: Axe,
  trophy: Trophy,
  crown: Crown,
  star: Star,
  hexagon: Hexagon,
  triangle: Triangle,
  flag: Flag,
  eye: Eye,
  feather: Feather,
  anchor: Anchor,
  bolt: Bolt,
  "shield-check": ShieldCheck,
};

export function TeamBadge({
  logoIcon = "shield",
  color = "#d5fb51",
  size = 48,
}: {
  logoIcon?: string;
  color?: string;
  size?: number;
}) {
  const Icon = TEAM_ICONS[logoIcon as keyof typeof TEAM_ICONS] || Shield;
  return (
    <span
      className="team-badge"
      style={{ ...eventStyle(color), width: size, height: size }}
      aria-hidden="true"
    >
      <Icon size={size * 0.5} strokeWidth={1.8} />
    </span>
  );
}
