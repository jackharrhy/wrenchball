/**
 * Formats a team's display name with its abbreviation
 * @param team - An object containing name and abbreviation
 * @returns The formatted team name in the format "Team Name (ABB)" or just the name if abbreviation is empty
 */
export function formatTeamName(team: {
  name: string;
  abbreviation: string;
}): string {
  if (!team.abbreviation) {
    return team.name;
  }
  return `${team.name} (${team.abbreviation})`;
}
