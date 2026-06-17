import { PLAYER_NAMES, TEAM_FLAGS } from '@/data/players';

const COMBINING_RE = new RegExp('[\\u0300-\\u036f]', 'g');

export function normalize(s) {
  return s.normalize('NFD').replace(COMBINING_RE, '').toLowerCase();
}

export function matchesSearch(code, q, teamName = '', teamCode = '') {
  if (!q) return true;
  const nq = normalize(q).replace(/\s+/g, '');
  if (normalize(code).replace(/\s+/g, '').includes(nq)) return true;
  if (normalize(PLAYER_NAMES[code] || '').includes(normalize(q))) return true;
  if (teamName && normalize(teamName).includes(normalize(q))) return true;
  if (teamCode && normalize(teamCode).includes(nq)) return true;
  return false;
}

export function parseStickersText(text) {
  const result = {};
  const cleaned = text.replace(/[^\w\s:,.;·()\-]/g, ' ');
  const upper = cleaned.toUpperCase().replace(/[·;]/g, ' ').replace(/,/g, ' ');
  const tokens = upper.split(/\s+/).filter(Boolean);
  let lastPrefix = null;

  for (const token of tokens) {
    if (/^[A-Z]{2,4}:?$/.test(token)) { lastPrefix = token.replace(':', ''); continue; }
    const combined = token.match(/^([A-Z]{2,4})(\d+)(?:\((\d+)X?\))?$/);
    if (combined) {
      const code = combined[1] + parseInt(combined[2]);
      result[code] = (result[code] || 0) + (combined[3] ? parseInt(combined[3]) : 1);
      lastPrefix = combined[1];
      continue;
    }
    const numOnly = token.match(/^(\d+)(?:\((\d+)X?\))?$/);
    if (numOnly && lastPrefix) {
      const rawNum = numOnly[1];
      const code = rawNum === '00' ? '00' : lastPrefix + parseInt(rawNum);
      result[code] = (result[code] || 0) + (numOnly[2] ? parseInt(numOnly[2]) : 1);
      continue;
    }
    if (!/^\d/.test(token)) lastPrefix = null;
  }
  return result;
}

export function groupByTeam(codeList, data) {
  const codeSet = new Set(Array.isArray(codeList) ? codeList : Object.keys(codeList));
  const groups = [];
  const fwc = data.specials.filter(c => codeSet.has(c));
  if (fwc.length) groups.push({ key: 'FWC', label: 'Copa do Mundo 2026', flag: '🏆', codes: fwc });
  const cc = data.coke.filter(c => codeSet.has(c));
  if (cc.length) groups.push({ key: 'CC', label: 'Coca-Cola Stickers', flag: '🥤', codes: cc });
  for (const team of data.teams) {
    const tc = team.stickers.filter(c => codeSet.has(c));
    if (tc.length) groups.push({ key: team.code, label: team.name, flag: TEAM_FLAGS[team.code] || '', codes: tc });
  }
  return groups;
}

export function codeNum(code) {
  const m = code.match(/^([A-Z]*)(\d+)$/);
  return m ? m[2] : code;
}

export function formatGroupLine(g) {
  return `${g.flag}${g.key}: ${g.codes.map(codeNum).join(' · ')}`;
}

export function generateDupText(duplicates, data) {
  const lines = ['Tenho essas figurinhas REPETIDAS da Copa 2026 disponíveis pra troca!', ''];
  for (const g of groupByTeam(duplicates, data)) lines.push(formatGroupLine(g));
  return lines.join('\n').trim();
}

export function generateMissingText(missingCodes, data) {
  const lines = ['Preciso dessas figurinhas da Copa 2026!', ''];
  for (const g of groupByTeam(missingCodes, data)) lines.push(formatGroupLine(g));
  return lines.join('\n').trim();
}

export function countOwned(codes, owned) {
  return codes.filter(c => owned.has(c)).length;
}

export function getTeamInfo(code, data) {
  if (code === '00') return { teamCode: 'FWC', teamName: 'Copa do Mundo 2026' };
  const m = code.match(/^([A-Z]+)\d+$/);
  if (!m) return { teamCode: '', teamName: code };
  const prefix = m[1];
  if (prefix === 'FWC') return { teamCode: 'FWC', teamName: 'Copa do Mundo 2026' };
  if (prefix === 'CC')  return { teamCode: 'CC',  teamName: 'Coca-Cola Stickers' };
  const team = data.teams.find(t => t.code === prefix);
  return team ? { teamCode: team.code, teamName: team.name } : { teamCode: prefix, teamName: prefix };
}

export function formatAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'agora';
  if (m < 60) return `há ${m}min`;
  if (h < 24) return `há ${h}h`;
  if (d === 1) return 'ontem';
  return `há ${d}d`;
}

export function buildHistEntry(row, data) {
  return {
    id: row.sticker_code + '_' + row.updated_at,
    ts: new Date(row.updated_at),
    type: !row.owned ? 'unmark' : (row.duplicates > 0 ? 'dup' : 'mark'),
    code: row.sticker_code,
    ...getTeamInfo(row.sticker_code, data),
    qty: row.duplicates || 0,
  };
}

export function teamSummary(codes, data) {
  const counts = {};
  codes.forEach(code => {
    const { teamCode } = getTeamInfo(code, data);
    if (teamCode) counts[teamCode] = (counts[teamCode] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const extra = Object.keys(counts).length - top.length;
  return top.map(([tc, n]) => `${tc}(${n})`).join(', ') + (extra > 0 ? `… +${extra}` : '');
}

export function shouldShow(filter, n, total) {
  if (filter === 'incomplete') return n > 0 && n < total;
  if (filter === 'complete') return n === total;
  if (filter === 'none') return n === 0;
  return true;
}
