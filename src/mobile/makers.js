/**
 * Grouping models by who made them.
 *
 * Plain .js, not inside MakerSection.jsx, so it can be imported by a test that
 * runs under bare node — the component cannot, and a rule the tests cannot
 * reach is a rule that drifts.
 */

/**
 * Group models by maker, biggest shelf first, ties broken alphabetically.
 *
 * Derived from the rows rather than a hard-coded order, so adding a model in
 * the Swift catalogue files it under its maker with no change here.
 */
export function byMaker (rows) {
  const groups = new Map()
  for (const m of rows || []) {
    const k = m.maker || 'Other'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(m)
  }
  return [...groups.entries()]
    .map(([maker, models]) => ({ maker, models }))
    .sort((a, b) => b.models.length - a.models.length || a.maker.localeCompare(b.maker))
}
