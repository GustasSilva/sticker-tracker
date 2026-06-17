'use client';
import { TEAM_ISO } from '@/data/players';

export function Flag({ teamCode }) {
  const iso = TEAM_ISO[teamCode];
  if (!iso) return null;
  return <span className={`fi fi-${iso}`} />;
}

export function GroupFlag({ groupKey, fallback }) {
  return TEAM_ISO[groupKey]
    ? <Flag teamCode={groupKey} />
    : fallback ? <span>{fallback}</span> : null;
}
