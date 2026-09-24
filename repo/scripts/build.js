const fs = require("fs");
const path = require("path");
const { validate } = require("./validate");
const { standings } = require("./standings");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const WORDMARK = `<a class="wm" href="#" onclick="return false" aria-label="Green Valley Country Club">
      <span class="wm-g">GREEN VALLEY</span><span class="wm-c">COUNTRY CLUB</span></a>`;
const WORDMARK_CSS = `.wm{text-decoration:none;display:block;flex:none;border-left:3px solid var(--green);padding-left:11px}
.wm-g{display:block;font-size:15px;font-weight:700;letter-spacing:.06em;color:var(--green);line-height:1.1}
.wm-c{display:block;font-size:10px;font-weight:600;letter-spacing:.22em;color:var(--ink);line-height:1.3}`;
const CREST_CSS = `.crest svg{height:30px;width:auto;flex:none;display:block}`;

const league = JSON.parse(read("data/league.json"));

const { errors, warnings } = validate(league);
warnings.forEach((w) => console.warn("  warn  " + w));
if (errors.length) {
  console.error(`\n${errors.length} problem${errors.length > 1 ? "s" : ""} in data/league.json:\n`);
  errors.forEach((e) => console.error("  error " + e));
  console.error("\nNothing was built. Fix the data and run again.\n");
  process.exit(1);
}

// shape the page's payload. the browser gets results, never the raw rules.
const payload = {
  season: league.season,
  matches: league.matches.map((m) => {
    const today = new Date().toISOString().slice(0, 10);
    const status = m.result ? "final" : m.date < today ? "unreported" : "scheduled";
    const o = { league: m.league, date: m.date, time: m.time, court: m.court,
                home: m.home, away: m.away, status };
    if (m.result) {
      o.detail = m.result.detail;
      if (m.result.games) {
        o.home_games = m.result.games[0];
        o.away_games = m.result.games[1];
        o.winner = m.result.games[0] > m.result.games[1] ? m.home : m.away;
      } else {
        o.winner = m.result.outcome === "home" ? m.home : m.away;
      }
      if (m.result.points) {
        o.home_points = m.result.points[0];
        o.away_points = m.result.points[1];
      }
      if (m.result.scores) o.scores = m.result.scores;
    }
    return o;
  }),
  published_through: league.published_standings?.through,
  byes: Object.fromEntries(Object.entries(league.byes || {}).flatMap(([d, ts]) =>
    Object.keys(league.teams).map((lg) => [`${lg}|${d}`,
      ts.filter((t) => league.teams[lg].includes(t))]).filter(([, v]) => v.length))),
};
for (const lg of Object.keys(league.teams)) payload[lg.toLowerCase()] = standings(league, lg);

let crest = { markup: WORDMARK, css: WORDMARK_CSS };
const crestPath = path.join(root, "assets", "crest.svg");
if (fs.existsSync(crestPath)) {
  const svg = fs.readFileSync(crestPath, "utf8").replace(/<\?xml.*?\?>/s, "").trim();
  if (svg.startsWith("<svg")) {
    crest = { markup: svg.replace("<svg ", `<svg role="img" aria-label="Green Valley Country Club" `), css: CREST_CSS };
  }
}

const html = read("template.html")
  .replace("<!--LOGO-->", crest.markup)
  .replace(CREST_CSS, crest.css)
  .replace("/*DATA*/", JSON.stringify(payload));

if (html.includes("/*DATA*/") || html.includes("<!--LOGO-->")) {
  console.error("build failed: a placeholder was not replaced");
  process.exit(1);
}

fs.mkdirSync(path.join(root, "public"), { recursive: true });
fs.writeFileSync(path.join(root, "public", "index.html"), html);

const played = league.matches.filter((m) => m.result).length;
console.log(`\nok  ${played}/${league.matches.length} matches reported, ` +
  `${crest.css === CREST_CSS ? "crest" : "wordmark"}, ${html.length} bytes -> public/index.html`);
