import Calendar from "romcal";
import philippines from "@romcal/calendar.philippines";

const { Philippines_En } = philippines;

function titleCaseFromKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function precedenceNumber(value) {
  const match = String(value || "").match(/_(\d+)[A-Z]?$/);
  return match ? Number(match[1]) : 99;
}

function psalterWeek(value) {
  const match = String(value || "").match(/WEEK_(\d)/);
  if (!match) return null;
  return ["I", "II", "III", "IV"][Number(match[1]) - 1] || null;
}

function liturgicalSeason(value) {
  const map = {
    ADVENT: "Advent",
    CHRISTMAS_TIME: "Christmas",
    LENT: "Lent",
    PASCHAL_TRIDUUM: "Paschal Triduum",
    EASTER_TIME: "Easter",
    ORDINARY_TIME: "Ordinary Time",
  };
  return map[value] || null;
}

function normalizeEvent(event) {
  const date = event.date;
  return {
    date,
    celebration_name: titleCaseFromKey(event.key),
    rank: event.rank || null,
    liturgical_season: liturgicalSeason(event.seasons?.[0]),
    psalter_week: psalterWeek(event.cycles?.psalterWeek),
    source_reference: event.key || null,
    raw_payload: event,
    _precedence_number: precedenceNumber(event.precedence),
  };
}

const year = Number(process.argv[2]);
if (!Number.isInteger(year) || year < 1970 || year > 9999) {
  console.error("Usage: node liturgical_romcal_helper.mjs <year>");
  process.exit(2);
}

const calendar = new Calendar({ localizedCalendar: Philippines_En });
const generated = await calendar.generateCalendar(year);
const events = Object.values(generated).flat().map(normalizeEvent);

const bestByDate = new Map();
for (const event of events) {
  const current = bestByDate.get(event.date);
  if (!current || event._precedence_number < current._precedence_number) {
    bestByDate.set(event.date, event);
  }
}

const records = Array.from(bestByDate.values())
  .sort((a, b) => a.date.localeCompare(b.date))
  .map(({ _precedence_number, ...event }) => event);

process.stdout.write(JSON.stringify(records));
