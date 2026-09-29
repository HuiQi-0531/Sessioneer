// Dashboard counts (were inline in dashboard.routes.js).
const countDashboardUnits = (unitStatuses) => ({
  activeUnitCount: unitStatuses.filter(u => u.isActive).length,
  availabilitySubmittedCount: unitStatuses.filter(u => u.availabilitySubmitted).length
});

module.exports = { countDashboardUnits };
