/**
 * Normalization for layout_config.jobLogsDetailGroups (Job Logs cards).
 * Tags may be plain strings (start/end) or { tagName, jobLogsValueMode }.
 * Cards may be jobLogsCardMode "segment_row" with segmentRowId (paginated silo_segments row).
 */

export const JOB_LOGS_VALUE_START_END = 'start_end';
export const JOB_LOGS_VALUE_UNIQUE = 'unique_in_range';
export const JOB_LOGS_CARD_TAGS = 'tags';
export const JOB_LOGS_CARD_SEGMENT_ROW = 'segment_row';

export function normalizeJobLogsTagEntry(raw) {
  if (typeof raw === 'string') {
    const tagName = raw.trim();
    if (!tagName) return null;
    return { tagName, jobLogsValueMode: JOB_LOGS_VALUE_START_END };
  }
  if (raw && typeof raw === 'object' && typeof raw.tagName === 'string') {
    const tagName = raw.tagName.trim();
    if (!tagName) return null;
    const mode = raw.jobLogsValueMode === JOB_LOGS_VALUE_UNIQUE
      ? JOB_LOGS_VALUE_UNIQUE
      : JOB_LOGS_VALUE_START_END;
    return { tagName, jobLogsValueMode: mode };
  }
  return null;
}

export function normalizeJobLogsGroup(raw, index = 0) {
  const id = String(raw?.id || '').trim() || `jg-${index}`;
  const title = (raw?.title && String(raw.title).trim())
    || (raw?.label && String(raw.label).trim())
    || `Card ${index + 1}`;
  const segmentRowId = typeof raw?.segmentRowId === 'string' ? raw.segmentRowId.trim() : '';
  const wantsSegment = raw?.jobLogsCardMode === JOB_LOGS_CARD_SEGMENT_ROW && segmentRowId;

  const rawTags = Array.isArray(raw?.tags) ? raw.tags : [];
  const tagEntries = [];
  const seen = new Set();
  for (const x of rawTags) {
    const e = normalizeJobLogsTagEntry(x);
    if (!e || seen.has(e.tagName)) continue;
    seen.add(e.tagName);
    tagEntries.push(e);
  }

  if (wantsSegment) {
    return {
      id,
      title,
      jobLogsCardMode: JOB_LOGS_CARD_SEGMENT_ROW,
      segmentRowId,
      tags: [],
    };
  }

  return {
    id,
    title,
    jobLogsCardMode: JOB_LOGS_CARD_TAGS,
    tags: tagEntries,
  };
}

/**
 * For each tag, if any card marks it unique_in_range, historian uses unique (overrides start/end).
 */
export function partitionJobLogsTagsByMode(groups) {
  const tagModeMap = new Map();
  for (const g of groups || []) {
    if (!g || g.jobLogsCardMode === JOB_LOGS_CARD_SEGMENT_ROW) continue;
    for (const e of g.tags || []) {
      const tagName = typeof e === 'string' ? e.trim() : e?.tagName?.trim();
      if (!tagName) continue;
      const mode = typeof e === 'object' && e.jobLogsValueMode === JOB_LOGS_VALUE_UNIQUE
        ? JOB_LOGS_VALUE_UNIQUE
        : JOB_LOGS_VALUE_START_END;
      if (!tagModeMap.has(tagName)) {
        tagModeMap.set(tagName, mode);
      } else if (mode === JOB_LOGS_VALUE_UNIQUE) {
        tagModeMap.set(tagName, JOB_LOGS_VALUE_UNIQUE);
      }
    }
  }
  const startEndTags = [];
  const uniqueTags = [];
  for (const [name, mode] of tagModeMap) {
    if (mode === JOB_LOGS_VALUE_UNIQUE) uniqueTags.push(name);
    else startEndTags.push(name);
  }
  return { startEndTags, uniqueTags, tagModeMap };
}

export function jobLogsGroupsFromLayoutConfig(layout) {
  const raw = layout?.jobLogsDetailGroups;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((row, i) => normalizeJobLogsGroup(row, i));
  }
  const legacy = Array.isArray(layout?.jobLogsDetailTags) ? layout.jobLogsDetailTags : [];
  const tagList = legacy.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim());
  if (tagList.length === 0) return [];
  return [{
    id: 'legacy',
    title: 'Tag values',
    jobLogsCardMode: JOB_LOGS_CARD_TAGS,
    tags: tagList.map((tagName) => ({ tagName, jobLogsValueMode: JOB_LOGS_VALUE_START_END })),
  }];
}

/** Flat tag union for layout-tags `data` (excludes segment-only cards). Order preserved. */
export function flattenJobLogsHistorianTagNames(groups) {
  const names = [];
  const seen = new Set();
  for (const g of groups || []) {
    if (!g || g.jobLogsCardMode === JOB_LOGS_CARD_SEGMENT_ROW) continue;
    for (const e of g.tags || []) {
      const n = typeof e === 'string' ? e.trim() : e?.tagName?.trim();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      names.push(n);
    }
  }
  return names;
}

export function jobLogsGroupHasRenderableContent(group) {
  if (!group) return false;
  if (group.jobLogsCardMode === JOB_LOGS_CARD_SEGMENT_ROW && group.segmentRowId) return true;
  return Array.isArray(group.tags) && group.tags.length > 0;
}

/** Persist to layout_config: plain strings for start_end, objects only for unique / segment cards. */
export function serializeJobLogsGroupsForLayout(nextGroups) {
  if (!Array.isArray(nextGroups)) return [];
  return nextGroups.map((g, i) => {
    const ng = normalizeJobLogsGroup(g, i);
    if (ng.jobLogsCardMode === JOB_LOGS_CARD_SEGMENT_ROW) {
      return {
        id: ng.id,
        title: ng.title,
        jobLogsCardMode: JOB_LOGS_CARD_SEGMENT_ROW,
        segmentRowId: ng.segmentRowId,
        tags: [],
      };
    }
    const tags = (ng.tags || []).map((t) => {
      if (t.jobLogsValueMode === JOB_LOGS_VALUE_UNIQUE) {
        return { tagName: t.tagName, jobLogsValueMode: JOB_LOGS_VALUE_UNIQUE };
      }
      return t.tagName;
    });
    return { id: ng.id, title: ng.title, tags };
  });
}
