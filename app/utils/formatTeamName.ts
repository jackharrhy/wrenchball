/**
 * Formats a team's display name with its abbreviation
 * @param team - An object containing name and abbreviation
 * @returns The formatted team name in the format "Team Name (ABB)"
 */
export function formatTeamName(team: {
  name: string;
  abbreviation: string;
}): string {
  return `${team.name} (${team.abbreviation})`;
}
