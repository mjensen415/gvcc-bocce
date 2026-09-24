// Every check here was a database constraint before the project moved to a
// flat file. They exist because each one corresponds to a real error found in
// the club's own records: misspelled team names creating phantom teams, a
// standings table that disagreed with its own match results, and a match night
// that passed with nothing reported and went unnoticed for three weeks.
//
// Errors fail the build. Warnings print and let it through, because some of
// them are just "nobody has filed last night's scores yet".

function validate(league) {
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(m);
  const W = (m) => warnings.push(m);

  const rosters = league.teams;
  const leagues = Object.keys(rosters);
  const known = new Set(leagues.flatMap((l) => rosters[l]));

  // 1. a team name is either on a roster or it does not exist.
  //    "Rollling Eagles" cost Rolling Eagles a loss in the spring workbook.
  for (const [alias, real] of Object.entries(league.aliases || {})) {
    if (!known.has(real)) E(`alias "${alias}" points at unknown team "${real}"`);
    if (known.has(alias)) E(`alias "${alias}" is also a real team name`);
  }

  const seen = new Map();
  league.matches.forEach((m, i) => {
    const where = `match ${i + 1} (${m.date} ${m.court})`;
    if (!leagues.includes(m.league)) return E(`${where}: unknown league "${m.league}"`);
    const roster = rosters[m.league];

    for (const side of ["home", "away"]) {
      if (!roster.includes(m[side])) {
        const fix = league.aliases?.[m[side]];
        E(`${where}: "${m[side]}" is not on the ${m.league} roster` +
          (fix ? `. Did you mean "${fix}"?` : ""));
      }
    }
    if (m.home === m.away) E(`${where}: a team cannot play itself`);

    // 2. one match per court per slot
    const slot = `${m.league}|${m.date}|${m.time}|${m.court}`;
    if (seen.has(slot)) E(`${where}: court double booked with ${seen.get(slot)}`);
    seen.set(slot, where);

    // 3. a bye is not a match
    const onBye = league.byes?.[m.date] || [];
    for (const side of ["home", "away"]) {
      if (onBye.includes(m[side])) E(`${where}: ${m[side]} is listed both playing and on a bye`);
    }

    if (!m.result) return;
    const r = m.result;
    if (r.detail === "outcome") {
      if (!["home", "away"].includes(r.outcome))
        E(`${where}: outcome-only result must say "home" or "away"`);
      if (r.games || r.points || r.scores)
        E(`${where}: marked outcome-only but carries games, points or scores`);
      if (!r.source) W(`${where}: outcome-only result with no source recorded`);
      return;
    }
    const [hg, ag] = r.games || [];
    const [hp, ap] = r.points || [];

    // 4. a match has a winner, and three games cannot produce more than three wins
    if (hg === ag) E(`${where}: games won ${hg}-${ag} is a tie, a match always has a winner`);
    if (hg + ag > league.rules.games_per_match)
      E(`${where}: ${hg + ag} games won exceeds ${league.rules.games_per_match} played`);
    if (Math.max(hg, ag) < 2) E(`${where}: neither team reached 2 games won`);

    // 5. detail level must be honest about what is actually known
    if (r.detail === "detail" && !r.scores)
      E(`${where}: marked as detail but carries no individual game scores`);
    if (r.detail === "summary" && !r.source)
      W(`${where}: summary result with no source recorded`);

    // 6. if individual scores exist they must agree with the totals, and
    //    respect the point target once the real one is known
    if (r.scores) {
      const target = league.rules.target_points;
      let sh = 0, sa = 0, wh = 0, wa = 0;
      r.scores.forEach(([a, b], gi) => {
        if (a === b) E(`${where} game ${gi + 1}: ${a}-${b} is tied`);
        if (target && Math.max(a, b) < target && !r.clock_expired?.[gi])
          E(`${where} game ${gi + 1}: ${a}-${b} has no team at ${target}`);
        sh += a; sa += b;
        if (a > b) wh++; else wa++;
      });
      if (wh !== hg || wa !== ag)
        E(`${where}: game scores give ${wh}-${wa} but games won says ${hg}-${ag}`);
      if (hp != null && (sh !== hp || sa !== ap))
        E(`${where}: game scores total ${sh}-${sa} but points say ${hp}-${ap}`);
    }
  });

  // 7. wins must equal losses, and games won must equal games played.
  //    this is the check that caught the missing spring match and the Friday
  //    team that was playing but absent from the standings.
  for (const lg of leagues) {
    const played = league.matches.filter((m) => m.league === lg && m.result);
    const scored = played.filter((m) => m.result.games);
    const gamesWon = scored.reduce((n, m) => n + m.result.games[0] + m.result.games[1], 0);
    const gamesPlayed = scored.reduce(
      (n, m) => n + (m.result.scores ? m.result.scores.length : m.result.games[0] + m.result.games[1]), 0);
    if (gamesWon !== gamesPlayed)
      E(`${lg}: ${gamesWon} games won across ${gamesPlayed} games played`);

    const w = played.length;
    const counts = {};
    for (const m of played) {
      counts[m.home] = (counts[m.home] || 0) + 1;
      counts[m.away] = (counts[m.away] || 0) + 1;
    }
    if (Object.values(counts).reduce((a, b) => a + b, 0) !== w * 2)
      E(`${lg}: match participation does not balance`);
  }

  // 8. a match night that has passed with nothing entered.
  //    a warning, not an error, because last night's scores are legitimately
  //    not in yet. it is here so it is impossible to not notice.
  const today = new Date().toISOString().slice(0, 10);
  const stale = league.matches.filter((m) => !m.result && m.date < today);
  const byDate = {};
  stale.forEach((m) => (byDate[m.date] = (byDate[m.date] || 0) + 1));
  for (const [date, n] of Object.entries(byDate)) {
    const age = Math.round((Date.parse(today) - Date.parse(date)) / 86400000);
    const msg = `${date}: ${n} match${n > 1 ? "es" : ""} unreported, ${age} day${age > 1 ? "s" : ""} ago`;
    const ack = league.acknowledged_gaps?.[date];
    if (ack) W(msg + ` (known: ${ack})`);
    else if (age > 10) E(msg + ". Enter it, or add the date to acknowledged_gaps with a reason.");
    else W(msg);
  }

  // an acknowledgement that no longer refers to anything is stale bookkeeping
  for (const date of Object.keys(league.acknowledged_gaps || {})) {
    if (!byDate[date]) W(`acknowledged_gaps has ${date} but nothing there is unreported`);
  }

  // 9. when the club has published a standings table, the computed one must
  //    reproduce it exactly. this is the check that caught a single mistyped
  //    match outcome that otherwise looked entirely plausible.
  const pubAll = league.published_standings;
  if (pubAll) {
    const { standings } = require("./standings");
    for (const lg of leagues) {
      if (!pubAll[lg]) continue;
      const mine = standings(league, lg);
      const theirs = Object.keys(pubAll[lg]);
      mine.forEach((r, i) => {
        if (theirs[i] && r.team !== theirs[i])
          E(`${lg} standings position ${i + 1}: computed "${r.team}" but the ` +
            `published table through ${pubAll.through} says "${theirs[i]}". ` +
            `A match outcome is wrong.`);
      });
    }
  }

  return { errors, warnings };
}

module.exports = { validate };
