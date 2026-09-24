# GVCC Bocce

Standings and schedule for the Thursday and Friday bocce leagues at Green Valley
Country Club. One static page. No database, no accounts, no server.

## What this is

A reference and scorekeeper. Results are published, not submitted. Somebody
already compiles the weekly standings PDF, so this reads from one file that a
person edits, validates it hard, and renders a page.

There is deliberately no captain login, no approval queue, and no community
section. Those need a backend. If they come back, they come back with one.

## Updating after a match night

Edit `data/league.json`, find the match, add a `result`:

```json
{
  "league": "Thursday", "date": "2026-09-10", "time": "17:30",
  "court": "Italia", "home": "DaVinci", "away": "D'Boccery",
  "result": {
    "games":  [2, 1],
    "points": [31, 27],
    "scores": [[12, 9], [7, 12], [12, 6]],
    "detail": "detail"
  }
}
```

`games` is required. `points` and `scores` are optional. Set `detail` to
`"detail"` when the three game scores are known and `"summary"` when only the
totals are, with a `source` naming where the totals came from.

Then `npm run build`. Push. Vercel redeploys.

## The build refuses to ship bad data

`scripts/validate.js` fails the build on:

- a team name that is not on a roster, suggesting the alias if one matches
- a tied match, or more games won than games played
- a court double booked, or a team both playing and on a bye
- individual game scores that disagree with the games won or the point totals
- wins not equalling losses across a league
- a match night more than ten days past with nothing entered

Every one of those corresponds to a real error found in the club's own records.
A three L "Rollling Eagles" in the spring workbook cost that team a loss and
went unnoticed all season. A Friday team played seven matches while missing
from the standings table entirely. September 3 this season passed with no score
reported and nobody noticed for three weeks.

Recent match nights with nothing entered are warnings, since last night's scores
are legitimately not in yet. Past ten days they become errors. A gap you know
about and accept goes in `acknowledged_gaps` with a reason, which drops it back
to a warning and keeps it visible instead of silently forgiven.

## Standings are computed, never typed

`scripts/standings.js` derives the table from match results. Order is wins
descending, then losses ascending, then games won, then total points scored.
That is the club's actual rule, confirmed against every published PDF from week
1 through week 5. Win percentage is displayed, not sorted on.

A bye is not an at bat. It adds neither a win nor a loss, so a team that has only
sat out carries 0-0 and sorts above anyone already holding a loss.

## Open questions in the data

`rules.target_points` is null. The spring rules PDF said a game ends at 12 points
or 30 minutes, but the fall standings contradict it: DaVinci shows 12 games won
on 133 points through week 5, and twelve wins at 12 apiece would need 144. Set
it once the real format is known and the validator starts enforcing per game
scores against it.

Weeks 4 and 5 arrived as a single combined standings sheet, so per match points
cannot be recovered from it. Those matches sit in `acknowledged_gaps` until
either an intermediate sheet turns up or somebody enters them by hand.

## Build

```
npm run build      # validates, computes standings, writes public/index.html
```

No dependencies. Node 18 or later. Vercel picks up `vercel.json` on import.

## Trademark

`assets/crest.svg` is the property of Green Valley Country Club. Remove it and
the build falls back to a plain wordmark. Do not publish it without the club's
approval.
