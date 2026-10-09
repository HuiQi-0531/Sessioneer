// Bug 15: sessions only store "day + time", not real dates. A tutor's
// MON 09:00 class in CAB201 Semester 2, 2027 must not count as a clash (or
// as extra weekly hours) when they are being scheduled in Semester 2, 2026.
// Every check that looks at a tutor's OTHER sessions limits itself to units
// in the same semester and year as the unit being scheduled.

// SQL: ids of all units in the same semester + year as the unit given by
// `unitExpr` (a placeholder like '$3' or a column like 's2.unit_id').
// Use as:  AND s.unit_id IN ${sameTermUnitIdsSql('$3')}
const sameTermUnitIdsSql = (unitExpr) => `(
  SELECT term_unit.id
  FROM units term_unit
  JOIN units this_unit ON this_unit.id = ${unitExpr}
  WHERE LOWER(TRIM(COALESCE(term_unit.semester, ''))) = LOWER(TRIM(COALESCE(this_unit.semester, '')))
    AND term_unit.year IS NOT DISTINCT FROM this_unit.year
)`;

module.exports = { sameTermUnitIdsSql };