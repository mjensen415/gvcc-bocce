// Standings are computed from matches, never stored. The club's own week 1
// Friday table had a team that was playing but missing from the standings
// entirely, and the spring workbook's rank column read "1" for every row.
// Deriving removes the possibility of either.
//
// Order: wins descending, then losses ascending, then games won, then total
// points scored. That is the rule the club's published standings actually
// follow, confirmed against every PDF from week 1 through week 5. Win
// percentage is a display column, not the sort key.
//
// A bye is not an at bat. It adds neither a win nor a loss, so a team that has
// only sat out carries 0-0 and sorts above anyone already holding a loss.

function standings(league, leagueName) {
  const rows = {};
  for (const team of league.teams[leagueName]) {
    rows[team] = { team, won: 0, lost: 0, games_won: 0, games_lost: 0,
                   points_for: 0, points_against: 0, byes: 0 };
  }
  for (const [date, teams] of Object.entries(league.byes || {})) {
    for (const t of teams) if (rows[t]) rows[t].byes++;
  }
  for (const m of league.matches) {
    if (m.league !== leagueName || !m.result) continue;
    // an outcome-only result knows who won and nothing else
    if (m.result.detail === "outcome") {
      const w = m.result.outcome === "home" ? m.home : m.away;
      const l = m.result.outcome === "home" ? m.away : m.home;
      if (rows[w]) rows[w].won++;
      if (rows[l]) rows[l].lost++;
      rows[w] && (rows[w].partial = true);
      rows[l] && (rows[l].partial = true);
      continue;
    }
    const [hg, ag] = m.result.games;
    const [hp, ap] = m.result.points || [null, null];
    const sides = [[m.home, hg, ag, hp, ap], [m.away, ag, hg, ap, hp]];
    for (const [team, gw, gl, pf, pa] of sides) {
      const r = rows[team];
      if (!r) continue;
      r.games_won += gw;
      r.games_lost += gl;
      if (pf != null) { r.points_for += pf; r.points_against += pa; }
      gw > gl ? r.won++ : r.lost++;
    }
  }
  // where any result is outcome-only, games won and points cannot be summed
  // from matches. fall back to the club's published season totals for those
  // two columns and mark the table so the page can say so.
  const pub = league.published_standings?.[leagueName];
  const incomplete = Object.values(rows).some((r) => r.partial);
  if (incomplete && pub) {
    for (const r of Object.values(rows)) {
      if (!pub[r.team]) continue;
      [r.games_won, r.points_for] = pub[r.team];
      r.games_lost = null;
      r.points_against = null;
      r.from_published = true;
    }
  }

  const out = Object.values(rows).map((r) => ({
    ...r,
    played: r.won + r.lost,
    pct: r.won + r.lost === 0 ? null : r.won / (r.won + r.lost),
    pct_str: r.won + r.lost === 0 ? "\u2014"
      : (r.won / (r.won + r.lost)).toFixed(3).replace(/^0/, ""),
  }));
  out.sort((a, b) =>
    b.won - a.won || a.lost - b.lost ||
    b.games_won - a.games_won || b.points_for - a.points_for ||
    a.team.localeCompare(b.team));
  out.forEach((r, i) => (r.position = i + 1));
  return out;
}

module.exports = { standings };
