import { cn } from "~/utils/cn";

const statsCharacterToTeamSlug = {
  Mario: "fireballs",
  Luigi: "knights",
  Peach: "monarchs",
  Daisy: "flowers",
  Yoshi: "eggs",
  Birdo: "bows",
  Wario: "muscles",
  Waluigi: "spitballs",
  Bowser: "monsters",
  "Bowser Jr.": "rookies",
  "Donkey Kong": "wilds",
  "Diddy Kong": "monkeys",
} as const;

export function TeamLogo({
  captainStatsCharacter,
  size = "lg",
  className = "",
}: {
  captainStatsCharacter?: string | null;
  size?: "lg" | "sm" | "xs";
  className?: string;
}) {
  const sizeClasses = {
    lg: "h-12 w-36 mx-auto",
    sm: "h-10",
    xs: "h-4",
  };

  if (!captainStatsCharacter) {
    return null;
  }

  if (!statsCharacterToTeamSlug.hasOwnProperty(captainStatsCharacter)) {
    throw new Error(
      `Invalid captain stats character: ${captainStatsCharacter}`,
    );
  }

  const logoSrc = `/images/teams/logos/${size === "lg" ? "large" : "small"}/${statsCharacterToTeamSlug[captainStatsCharacter as keyof typeof statsCharacterToTeamSlug]}.png`;

  return (
    <img
      src={logoSrc}
      alt={captainStatsCharacter}
      className={cn(sizeClasses[size], className)}
    />
  );
}
