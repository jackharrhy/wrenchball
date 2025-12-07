/**
 * Formats a location name with day/night emojis as a suffix,
 * replacing `(Day)` or `(Night)` with the appropriate emoji.
 * @param name - The location name (e.g., "Mario Stadium (Day)", "Bowser's Castle")
 * @returns The formatted name with emoji suffix
 */
export function formatLocationName(name: string): string {
  if (name.endsWith("(Day)")) {
    return name.replace(/\s*\(Day\)\s*$/, " ☀️");
  }
  if (name.endsWith("(Night)")) {
    return name.replace(/\s*\(Night\)\s*$/, " 🌙");
  }
  return name;
}
