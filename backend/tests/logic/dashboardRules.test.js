const { countDashboardUnits } = require('../../utils/dashboardRules');

const units = [
  { isActive: true, availabilitySubmitted: true },
  { isActive: true, availabilitySubmitted: false },
  { isActive: false, availabilitySubmitted: true }
];

describe('countDashboardUnits', () => {
  test('LG-434: counts active units only', () => {
    expect(countDashboardUnits(units).activeUnitCount).toBe(2);
  });
  test('LG-435: counts units with availability submitted', () => {
    expect(countDashboardUnits(units).availabilitySubmittedCount).toBe(2);
  });
});
