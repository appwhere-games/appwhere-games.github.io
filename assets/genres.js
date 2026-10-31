import {appleGenreNames} from './apple-genres.js';
export function normalizeTags(values) {
  return [...new Set(values.filter(value=>typeof value==='string')
    .map(value=>value.trim().replace(/^Games\s*[-:]\s*/i,'').replace(/^Role[- ]?Playing$/i,'Role Playing'))
    .filter(value=>value && !['games','game','other','entertainment'].includes(value.toLowerCase())))].sort();
}

export function gameTags(app) {
  return normalizeTags(Array.isArray(app.tags) ? app.tags : [app.category]);
}

export function appleGameTags(app) {
  return normalizeTags((app.genreIds || []).map(id=>appleGenreNames[String(id)]).filter(Boolean));
}
