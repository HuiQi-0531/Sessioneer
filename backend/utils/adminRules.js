// Admin logic used by admin.routes.js.
const { formatUserNameFields, joinUserName } = require('./userNames');
const { toDateKey } = require('./brisbaneTime');

const VALID_ROLES = new Set(['admin', 'coordinator', 'tutor']);
const VALID_ACCOUNT_STATUSES = new Set(['active', 'pending', 'disabled']);
const VALID_MEMBERSHIP_ROLES = new Set(['coordinator', 'tutor', 'super_tutor']);
const TUTOR_MEMBERSHIP_ROLES = ['tutor', 'super_tutor'];
const MEMBERSHIP_ROLE_LABELS = {
  coordinator: 'unit coordinator',
  tutor: 'tutor',
  super_tutor: 'super tutor'
};

const normaliseRole = (role) => {
  const value = String(role || '').trim().toLowerCase();

  if (value === 'unit coordinator' || value === 'uc') return 'coordinator';
  if (value === 'administrator') return 'admin';
  if (VALID_ROLES.has(value)) return value;

  return '';
};

const normaliseMembershipRole = (role) => {
  const value = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  if (value === 'unit_coordinator' || value === 'uc') return 'coordinator';
  if (value === 'supertutor') return 'super_tutor';
  if (VALID_MEMBERSHIP_ROLES.has(value)) return value;

  return '';
};

const isTutorMembershipRole = (role) => TUTOR_MEMBERSHIP_ROLES.includes(role);

const normaliseAccountStatus = (status) => {
  const value = String(status || 'active').trim().toLowerCase();
  return VALID_ACCOUNT_STATUSES.has(value) ? value : '';
};

const formatAdminUser = (user) => ({
  id: user.id,
  ...formatUserNameFields(user),
  email: user.email,
  role: user.role,
  accountStatus: user.account_status || 'active',
  avatarUrl: user.avatar_url || null,
  phoneNumber: user.phone_number || '',
  unitCount: Number(user.unit_count || 0),
  coordinatorUnitCount: Number(user.coordinator_unit_count || 0),
  tutorUnitCount: Number(user.tutor_unit_count || 0),
  unitSummary: user.unit_summary || '',
  createdAt: user.created_at || null
});

const formatAdminUnit = (unit) => ({
  id: unit.id,
  unitCode: unit.unit_code,
  unitName: unit.unit_name,
  semester: unit.semester,
  year: unit.year,
  enrolmentSize: unit.enrolment_size,
  availabilityDeadline: unit.availability_deadline,
  availabilityLocked: unit.availability_locked,
  scheduleLocked: unit.schedule_locked,
  draftReleased: unit.draft_released,
  teachingStartDate: toDateKey(unit.teaching_start_date),
  teachingEndDate: toDateKey(unit.teaching_end_date),
  mainCoordinatorName: joinUserName(unit.main_coordinator_name, unit.main_coordinator_last_name),
  mainCoordinatorEmail: unit.main_coordinator_email || '',
  coordinators: unit.coordinators || '',
  coordinatorCount: Number(unit.coordinator_count || 0),
  tutorCount: Number(unit.tutor_count || 0),
  sessionCount: Number(unit.session_count || 0)
});

const formatAdminUnitTutor = (tutor) => ({
  id: tutor.id,
  ...formatUserNameFields(tutor),
  email: tutor.email,
  role: tutor.role,
  membershipRole: tutor.membership_role || 'tutor',
  isSuperTutor: tutor.membership_role === 'super_tutor',
  avatarUrl: tutor.avatar_url || null,
  assignedSessionCount: Number(tutor.assigned_session_count || 0)
});

const formatAdminUserUnitAccess = (membership) => ({
  unitId: membership.unit_id,
  unitCode: membership.unit_code,
  unitName: membership.unit_name,
  semester: membership.semester,
  year: membership.year,
  role: membership.access_role,
  isPrimaryCoordinator: !!membership.is_primary_coordinator,
  assignedSessionCount: Number(membership.assigned_session_count || 0)
});

const formatAdminSession = (session) => ({
  id: session.id,
  unitId: session.unit_id,
  unitCode: session.unit_code,
  unitName: session.unit_name,
  semester: session.semester,
  year: session.year,
  day: session.day,
  startTime: session.start_time,
  endTime: session.end_time,
  location: session.location || '',
  campus: session.campus || '',
  sessionType: session.session_type || '',
  capacity: session.capacity,
  requiredTutors: session.required_tutors,
  status: session.status || 'Draft',
  assignedTutorCount: Number(session.assigned_tutor_count || 0),
  assignedTutors: session.assigned_tutors || '',
  tutorConfirmationState: session.tutor_confirmation_state || 'Unassigned',
  scheduleLocked: !!session.schedule_locked
});

// ---- Admin session staff assignment (added by the team on 29 Sep 2026) ----

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

// One staff row from getAdminSessionStaff's query.
const formatAdminStaff = (staff) => ({
  id: staff.id,
  name: joinUserName(staff.name, staff.last_name) || staff.email,
  email: staff.email,
  role: staff.access_role,
  maximumHours: staff.maximum_hours == null ? null : Number(staff.maximum_hours)
});

// Checks when an admin edits a session that already has staff (was inline in PUT /admin/sessions/:id).
const checkAdminSessionEdit = (current, unitId, requiredTutors) => {
  if (current.assigned_count > 0 && unitId !== current.unit_id) {
    return 'Unassign staff before moving this session to another unit';
  }
  if (requiredTutors < current.assigned_count) {
    return 'Tutors required cannot be lower than the number already assigned';
  }
  return null;
};

// True if any assigned person is a normal Tutor (so the session cannot become a Lecture/Consultation).
const hasIneligibleForSuperTutorType = (assignedRows, staff) => {
  const eligibleIds = new Set(staff.filter(member => member.role !== 'tutor').map(member => member.id));
  return assignedRows.some(item => !eligibleIds.has(item.tutor_id));
};

// Room check before an admin assigns staff (was inline in POST /admin/sessions/:id/assignments).
const checkAdminAssignSlot = (existingRows, tutorId, requiredTutors) => {
  const activeAssignments = existingRows.filter(item => item.tutor_confirmed !== false);
  if (activeAssignments.some(item => item.tutor_id === tutorId)) {
    return 'This staff member is already assigned to the session';
  }
  if (activeAssignments.length >= Number(requiredTutors || 1)) {
    return 'This session already has its required number of staff assigned';
  }
  return null;
};

const formatAdminApplication = (application) => ({
  id: application.id,
  unitId: application.unit_id,
  unitCode: application.unit_code || '',
  unitName: application.unit_name || '',
  firstName: application.name || '',
  lastName: application.last_name || '',
  fullName: [application.name, application.last_name].filter(Boolean).join(' ') || 'Pending profile',
  email: application.email,
  phoneNumber: application.phone_number || '',
  workExperience: application.work_experience || '',
  maximumHours: application.maximum_hours,
  contractType: application.contract_type || '',
  hasResume: !!application.resume_filename,
  resumeFilename: application.resume_filename || '',
  status: application.status || 'pending',
  appliedAt: application.applied_at,
  invitedAt: application.invited_at,
  inviteExpiresAt: application.invite_token_expires_at,
  createdUserId: application.created_user_id || null,
  invitedByName: [application.invited_by_name, application.invited_by_last_name].filter(Boolean).join(' '),
  invitedByEmail: application.invited_by_email || '',
  coordinatorName: [application.coordinator_name, application.coordinator_last_name].filter(Boolean).join(' '),
  coordinatorEmail: application.coordinator_email || ''
});

const formatAdminRequest = (request) => ({
  id: request.id,
  requestGroup: request.request_group,
  requestType: request.request_type,
  unitId: request.unit_id,
  unitCode: request.unit_code || '',
  unitName: request.unit_name || '',
  tutorName: [request.tutor_name, request.tutor_last_name].filter(Boolean).join(' ') || request.tutor_email || 'Unknown tutor',
  tutorEmail: request.tutor_email || '',
  coordinatorName: [request.coordinator_name, request.coordinator_last_name].filter(Boolean).join(' '),
  coordinatorEmail: request.coordinator_email || '',
  priority: request.priority || '',
  status: request.status || '',
  reason: request.reason || '',
  currentSession: request.current_session || '',
  preferredSwapTo: request.preferred_swap_to || '',
  reviewNotes: request.review_notes || '',
  submittedAt: request.submitted_at,
  reviewedAt: request.reviewed_at,
  sessionLabel: request.session_label || '',
  location: request.location || '',
  claimedByName: [request.claimed_by_name, request.claimed_by_last_name].filter(Boolean).join(' '),
  claimedByEmail: request.claimed_by_email || '',
  claimedAt: request.claimed_at
});

// Same email check the admin user forms used inline.
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// An admin cannot remove their own admin role or disable themselves
// (was inline in PUT /admin/users/:id).
const getSelfEditError = (targetUserId, currentUserId, role, accountStatus) => {
  if (targetUserId === currentUserId && role !== 'admin') {
    return 'You cannot remove admin access from your own account';
  }
  if (targetUserId === currentUserId && accountStatus === 'disabled') {
    return 'You cannot disable your own admin account';
  }
  return null;
};

module.exports = {
  VALID_ROLES,
  VALID_ACCOUNT_STATUSES,
  VALID_MEMBERSHIP_ROLES,
  TUTOR_MEMBERSHIP_ROLES,
  MEMBERSHIP_ROLE_LABELS,
  normaliseRole,
  normaliseMembershipRole,
  isTutorMembershipRole,
  normaliseAccountStatus,
  formatAdminUser,
  formatAdminUnit,
  formatAdminUnitTutor,
  formatAdminUserUnitAccess,
  formatAdminSession,
  formatAdminApplication,
  formatAdminRequest,
  isValidEmail,
  getSelfEditError,
  isUuid,
  formatAdminStaff,
  checkAdminSessionEdit,
  hasIneligibleForSuperTutorType,
  checkAdminAssignSlot
};
