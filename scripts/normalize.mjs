import {currentDay} from '../assets/day.js';
export function releaseDay(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/);
  // English store dates have no timezone. Parse them as calendar dates in UTC.
  const english = value.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const month = english ? months.indexOf(english[1].slice(0,3).toLowerCase()) : -1;
  if (!iso && (!english || month < 0)) return null;
  const date = iso ? new Date(`${iso[1]}T12:00:00Z`) : new Date(Date.UTC(Number(english[3]),month,Number(english[2]),12));
  if (!Number.isFinite(date.getTime())) return null;
  const result = date.toISOString().slice(0, 10);
  if (iso && result !== iso[1]) return null;
  if (english && date.getUTCDate() !== Number(english[2])) return null;
  return result;
}

export function recentRelease(value, now = new Date(), days = 180) {
  const day = releaseDay(value);
  if (!day) return null;
  const today = currentDay(now);
  const cutoff = currentDay(new Date(now.getTime() - days * 86400000));
  return day <= today && day >= cutoff ? day : null;
}

export function mergeApps(existing, incoming) {
  const map = new Map(existing.map(app => [app.id, app]));
  for (const app of incoming) {
    const previous = map.get(app.id);
    map.set(app.id, {...previous, ...app,
      firstSeenAt: previous?.firstSeenAt || app.firstSeenAt,
      countries: [...new Set([...(previous?.countries || []), ...app.countries])].sort()
    });
  }
  return [...map.values()].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name));
}
