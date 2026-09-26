// Sessioneer knowledge base for the bot.
// Written from the User Manual Guide. Each entry is one small topic so the bot
// only gets the few sections relevant to the question (a 7B model gets confused
// if you give it the whole manual at once).
//
// To teach the bot something new: add or edit an entry here. No retraining needed.
//   roles    - who this applies to: 'coordinator', 'tutor', 'admin'
//   keywords - words people might type when asking about it (English + Chinese)
//   content  - the facts. Only write what really exists in the system.

// Always sent to the model, whatever the question.
const OVERVIEW = `Sessioneer is a tutor scheduling system (used at QUT). There are three kinds of users:
- Unit Coordinator (UC): manages units, sessions, tutors, applications, availability, the schedule, requests and messages.
- Tutor / Super Tutor: submits availability, confirms assigned sessions, claims cover, makes swap/change requests, messages.
  Super Tutor is a unit-level access type; only Super Tutors can be assigned to restricted session types (Lectures and Consultations).
- Admin: separate Admin Console to manage all users, units, sessions, applications and requests across the system.

UC sidebar pages: Dashboard, Unit Setup, Sessions, Tutors, Applications, Availability, Schedule Builder, Requests, Messages. Profile is opened from the name at the bottom-left.
Tutor sidebar pages: Dashboard, Sessions, Availability, Schedule, Requests, Messages.
Admin sidebar: Home, Users, Units, Sessions, Applications, Requests, Settings.
The Active Unit box at the top of the sidebar decides which unit every page shows. Click it to switch units.
The bell icon at the top-right shows notifications.`;

const SECTIONS = [
  // ---------------- Unit Coordinator ----------------
  {
    id: 'uc_login',
    title: 'Log in, forgot password, register (UC)',
    roles: ['coordinator', 'tutor'],
    keywords: ['login', 'log in', 'sign in', 'password', 'forgot', 'reset', 'register', 'sign up', 'account', 'create account', '登录', '密码', '忘记密码', '注册', '账号'],
    content: `Log In page: enter Email and Password, click Log In to go to the Dashboard.
Forgot password: click "Forgot password" on the Log In page, enter your email, click "Send Reset Link" - a reset link is emailed to you. "Back to Login" returns without sending.
Register (new UC): click the Register link on the Log In page, fill First Name, Last Name, Email, Password, Confirm Password (Role is fixed to Unit Coordinator), then click "Create Account".
Pending or disabled accounts cannot log in - contact an admin.
Logout: click the logout icon next to your name at the bottom of the sidebar.`
  },
  {
    id: 'uc_dashboard',
    title: 'UC Dashboard',
    roles: ['coordinator'],
    keywords: ['dashboard', 'home', 'overview', 'stats', 'quick actions', 'notification', 'bell', 'active unit', 'switch unit', 'change unit', '主页', '首页', '通知', '切换', '快捷'],
    content: `The Dashboard is the UC's starting page.
- Active unit indicator (top of sidebar): shows the selected unit (e.g. IFN501, Semester 2 2026). Click to switch units. If you are UC for some units and tutor for others, the dropdown separates the two.
- Summary cards: Active Units, Pending Requests, Unassigned Sessions, Awaiting Tutor Confirmation.
- Quick Actions: shortcut buttons to Sessions, Tutors, Applications, Availability, Schedule Builder, Requests, Messages, View All Units.
- Notifications feed: recent activity like new swap/change requests and tutor confirmations. The bell icon at the top-right shows alerts; unread indicators show what needs attention.`
  },
  {
    id: 'uc_unit_setup',
    title: 'Unit Setup page (list, delete)',
    roles: ['coordinator'],
    keywords: ['unit setup', 'unit', 'units', 'delete unit', 'inactive', 'archived', 'unit list', 'remove unit', '单元', '科目', '删除', '课程'],
    content: `Unit Setup (sidebar) is where a UC manages their units.
- Search bar: filter units by code or name.
- "Create Unit" button: make a new unit.
- Active Units / Inactive Units tabs: current units vs archived ones from past semesters.
- Click a unit card to select it as the active unit (it turns purple).
- Buttons under the selected unit: Sessions (go to its sessions), Edit, Duplicate, Delete (permanently removes the unit - use carefully, related data may be affected).`
  },
  {
    id: 'uc_create_unit',
    title: 'Create a unit',
    roles: ['coordinator'],
    keywords: ['create unit', 'new unit', 'add unit', 'make unit', 'enrolment', 'availability deadline', 'deadline', '创建单元', '新建', '新单元', '截止'],
    content: `How to create a unit: Unit Setup -> click "Create Unit" -> fill in:
- Unit Code (e.g. IFN501), Unit Name (e.g. Digital Futures), Semester
- Enrolment Size (expected students, helps work out how many tutors are needed)
- Availability Deadline (date tutors must submit availability by)
- Unit Coordinators section (optional): add other coordinators by email
Then click "Create Unit". Cancel discards it.
Campus and delivery mode are NOT set on the unit - they are set per session.`
  },
  {
    id: 'uc_edit_unit',
    title: 'Edit a unit / add another coordinator',
    roles: ['coordinator'],
    keywords: ['edit unit', 'change unit', 'update unit', 'add coordinator', 'co-coordinator', 'another uc', 'sub uc', 'main coordinator', '编辑单元', '修改', '添加协调员', '其他uc'],
    content: `Edit a unit: Unit Setup -> select the unit -> click "Edit". You can change Unit Code, Unit Name, Semester, Enrolment Size, Availability Deadline.
Add another coordinator: in the Unit Coordinators box type their email in the add field and click "Add". The original creator is labelled "Main". Additional UCs get full coordinator access to that unit.
Click "Save Changes" to save, or Cancel.`
  },
  {
    id: 'uc_duplicate_unit',
    title: 'Duplicate a unit for a new semester',
    roles: ['coordinator'],
    keywords: ['duplicate', 'copy unit', 'clone', 'new semester', 'next semester', 'reuse', '复制', '下学期', '新学期'],
    content: `Duplicate a unit (reuse last semester's setup): Unit Setup -> select the unit -> click "Duplicate". In the dialog check/edit Unit code and Unit name, pick the Semester and enter the Year, then click "Duplicate".
Sessions and tutors are copied to the new unit; everything else starts fresh.`
  },
  {
    id: 'uc_sessions',
    title: 'Sessions page',
    roles: ['coordinator'],
    keywords: ['sessions', 'session list', 'filter sessions', 'search session', 'edit session', 'delete session', 'list view', 'grid view', 'class', 'classes', '课程', '课', '编辑', '删除课'],
    content: `Sessions (sidebar) lists all teaching sessions for the active unit.
- Table columns: No., Day, Time, Location, Campus, Type, Capacity, Tutor, Status.
- List View / Grid View toggle changes the layout.
- Filters button: filter by day, type, campus, status, unassigned.
- Edit (pencil icon) opens an edit popup; Delete (bin icon) removes the session (deleted sessions disappear from schedule views).
- Top buttons: "Request Cover" (left), "Upload Session" and "Add Session" (right).`
  },
  {
    id: 'uc_add_session',
    title: 'Add a session manually',
    roles: ['coordinator'],
    keywords: ['add session', 'create session', 'new session', 'make session', 'session code', 'draft', 'capacity', 'campus', 'tutorial', 'lecture', 'practical', 'consultation', '添加课', '创建课', '新课', '加课'],
    content: `Add one session: Sessions -> click "Add Session" (top-right). Fill in:
Day, Start Time, End Time, Location (e.g. GP-P-419), Campus, Type (Tutorial / Lecture / Practical / Consultation), Capacity (max students), Tutor (number of tutors needed), Session Code (optional - auto-generated if blank, e.g. TUT01), Status (Confirmed or Draft).
Click "Save" to create it, or Cancel.
Note: Lectures and Consultations can only be staffed by Super Tutors.`
  },
  {
    id: 'uc_upload_session',
    title: 'Upload / import sessions from CSV',
    roles: ['coordinator'],
    keywords: ['upload', 'import', 'csv', 'bulk', 'timetable file', 'template', 'spreadsheet', 'excel', '上传', '导入', '批量', '模板'],
    content: `Bulk-import sessions: Sessions -> click "Upload Session". Then either drag a timetable CSV into the drop zone or click "Choose CSV File". The system auto-detects the table(s) in the file.
Click "Download Template" to get a blank CSV in the right format.
The flow: upload file -> map columns -> review existing sessions -> confirm import. Import progress is kept if you leave the page and come back. Cancel leaves without importing. "How this works" (top-right) explains it.`
  },
  {
    id: 'uc_request_cover',
    title: 'Request cover for a tutor (UC)',
    roles: ['coordinator'],
    keywords: ['cover', 'request cover', 'replacement', 'sick', 'absent', 'cant make', "can't make", 'leave', 'substitute', '代课', '请假', '替课', '找人代', '生病'],
    content: `When a tutor can't make their session(s): go to Sessions -> click "Request Cover" (top-left, NOT on the Requests page).
In the dialog: pick the tutor in "Which tutor?", tick the session(s) to cover (or Select all), optionally type a Reason, pick a start date on the calendar, then click "Send".
Every other tutor on the unit is notified (and emailed). The first tutor to claim each session gets it. The UC gets an email when it is claimed.`
  },
  {
    id: 'uc_tutors',
    title: 'Tutors page (star, flag, priority, tags, notes)',
    roles: ['coordinator'],
    keywords: ['tutors', 'tutor list', 'star', 'favourite', 'flag', 'priority', 'preferred', 'standard', 'tags', 'notes', 'early access', 'early schedule access', 'tutor profile', 'tutor detail', '助教', '导师', '优先', '标签', '备注', '收藏', '旗'],
    content: `Tutors (sidebar) shows every tutor on the active unit as cards.
- Search bar (by name) and Filters (priority, tags, starred, flagged, availability, early access).
- Star icon = favourite; Flag icon = needs attention / concern.
- Card shows experience, max hours, contract type, priority badge (Preferred / Standard) and tags (e.g. Super Tutor, Experienced, Friendly).
Click a card to open Tutor Detail:
- Email, Phone, Max Hours, Contract Type, Experience are set by the tutor and can't be edited here.
- "Early schedule access" checkbox: lets that tutor see the draft schedule early.
- Priority dropdown (Preferred / Standard), Tags (type + Add), Notes (only UCs can see).
- Click "Save Changes".`
  },
  {
    id: 'uc_applications',
    title: 'Applications page (applicants, application link)',
    roles: ['coordinator'],
    keywords: ['applications', 'applicant', 'apply', 'application link', 'hire', 'recruit', 'pending', 'invited', 'joined', 'resume', 'cv', 'copy link', '申请', '招聘', '申请链接', '简历'],
    content: `Applications (sidebar) manages tutor applications and invites for the active unit.
- "Application link" dropdown: create/manage the public link tutors use to apply. Share it with applicants.
- "+ Invite a known tutor directly": invite someone by email (see invite topic).
- Tabs: Pending (submitted, waiting review), Invited (offered a place), Joined (added to the unit).
- Each applicant card: name (or "Pending profile" if they haven't finished), email, date applied, status badge (e.g. INVITED), "Invited as Tutor" badge, and "Copy Link" to resend their personal invite link.
- Open an application to download the applicant's resume. Accept/invite suitable applicants as Tutor or Super Tutor.`
  },
  {
    id: 'uc_invite',
    title: 'Invite a known tutor',
    roles: ['coordinator'],
    keywords: ['invite', 'invite tutor', 'add tutor', 'add a tutor', 'invite link', 'super tutor', 'bring in', '邀请', '添加助教', '加助教', '拉人'],
    content: `To add a tutor you already know: Applications -> click "+ Invite a known tutor directly" -> enter the Tutor email -> choose "Invite as" (Tutor or Super Tutor) -> click "Create Invite Link".
Existing users are added to the unit straight away. New users get an activation link to set up their profile.
Super Tutors can also be assigned to Lectures and Consultations.`
  },
  {
    id: 'uc_application_form',
    title: 'Edit the application form',
    roles: ['coordinator'],
    keywords: ['application form', 'edit form', 'form builder', 'custom field', 'question', 'required field', '申请表', '表单', '问题', '必填'],
    content: `Customise what applicants fill in: Applications -> open the form editor (Edit Application Form).
- First name, Last name, Email are fixed and always required.
- Custom fields (e.g. Phone number, Relevant work experience, Maximum hours/week): edit the label and type (Short text, Paragraph, Number, etc.).
- "Required" checkbox makes a field mandatory; up/down arrows reorder; Delete removes a field.
- "Back to Applications" returns.
The applicant sees a public form with an "Applying for" banner, your fields, a PDF resume upload, and "Submit Application".`
  },
  {
    id: 'uc_availability',
    title: 'View tutor availability / lock submissions (UC)',
    roles: ['coordinator'],
    keywords: ['availability', 'available', 'submitted', 'not submitted', 'lock', 'unlock', 'lock submissions', 'who can teach', 'preferred', 'avoid', 'fullscreen', '空闲', '可用时间', '时间表', '锁定', '解锁', '没交', '未提交'],
    content: `Availability (sidebar) shows a grid of every tutor's submitted availability for the active unit.
- Day tabs MON-FRI; legend: Preferred = green, Available = blue, Avoid = red. Blank cell = not submitted.
- Each column is one tutor; an empty column with a notification icon means that tutor hasn't submitted yet.
- Search bar filters by tutor name. Zoom -, +, Reset, and Fullscreen buttons for big grids.
- "Lock Submissions" stops tutors changing their availability (usually after the deadline). Unlock again if tutors need more time.
Tip: you can also ask me "who on <unit code> hasn't submitted availability" and I'll look it up.`
  },
  {
    id: 'uc_schedule_builder',
    title: 'Schedule Builder (assign tutors)',
    roles: ['coordinator'],
    keywords: ['schedule builder', 'assign', 'assign tutor', 'assign staff', 'unassigned', 'allocate', 'staffing', 'change tutor', 'reassign', 'unassign', 'suggest tutors', 'timetable', '排课', '分配', '安排', '指派', '换人', '排班'],
    content: `Schedule Builder (sidebar) is where the UC assigns tutors to sessions.
- Top cards: Unassigned Sessions, Confirmed Sessions, Awaiting Confirmation, Total Sessions.
- Tabs: List View, Grid View, Finalise.
- Unassigned table: sessions with no tutor. A "Suggest N tutors" badge means the session needs more than one tutor. Click "Assign Staff" to staff it.
- Assigned table: sessions with tutors and their status. Click "Change" to reassign or unassign.
Assign Teaching Staff dialog: ranks eligible tutors with star/flag and priority, shows a suitability note (e.g. "Marked this whole time as preferred" or "No availability submitted"), and conflict warnings (overlapping confirmed session, tentative assignment awaiting confirmation, or exceeding max weekly hours). Click "Assign"; it is greyed out when the system blocks it.
Only Super Tutors can be assigned to Lectures/Consultations. A UC can assign themselves to sessions in their own unit.
After assigning, the tutor must Accept or Decline on their Schedule page; if they do nothing for 3 days they get a reminder email.`
  },
  {
    id: 'uc_finalise',
    title: 'Grid view, release, export, lock & finalise schedule',
    roles: ['coordinator'],
    keywords: ['finalise', 'finalize', 'lock schedule', 'lock the schedule', 'final schedule', 'release', 'unrelease', 'un-release', 'draft schedule', 'publish', 'export', 'pdf', 'download schedule', 'grid', '发布', '导出', '定稿', '锁定课表', '最终'],
    content: `Schedule Builder -> "Finalise" tab (also Grid View) shows a Monday-Friday calendar of every session with its time, code, location and tutor ("(pending)" = tutor hasn't confirmed). Colours: Confirmed, Awaiting confirmation, Unassigned.
- "Export" dropdown: download the schedule (CSV or PDF).
- Release / "Un-release Draft": release the draft so tutors can see it, or withdraw it if more changes are needed.
- "Lock & Finalise Schedule": locks the schedule as final - no more changes.`
  },
  {
    id: 'uc_requests',
    title: 'Handle tutor swap / change requests (UC)',
    roles: ['coordinator'],
    keywords: ['requests', 'request', 'swap', 'change request', 'approve', 'reject', 'suggest', 'alternative', 'pending', 'urgent', 'request history', '请求', '换课', '调课', '批准', '拒绝', '审批'],
    content: `Requests (sidebar, page title "Request & Swap") is where the UC handles tutor swap and change requests for the active unit.
- Left "Pending Status" panel: requests waiting for you. Each shows the tutor, submit time, badges (e.g. URGENT, SESSION SWAP, PENDING), Current Session -> Preferred Swap To, and the tutor's Reason.
- Buttons: "Approve", "Reject", or "Suggest" (propose another option - the tutor can accept or reject your suggestion).
- Right "Confirmation Status" panel: history of requests already handled, with outcome (ACCEPTED / REJECTED).
Note: cover requests are made from the Sessions page ("Request Cover"), not here.`
  },
  {
    id: 'uc_messages',
    title: 'Messages / group chat',
    roles: ['coordinator', 'tutor'],
    keywords: ['message', 'messages', 'chat', 'group chat', 'dm', 'direct message', 'send file', 'attach', 'attachment', 'talk to', 'contact', '消息', '聊天', '群聊', '私聊', '发文件', '附件', '联系'],
    content: `Messages (sidebar):
- Left column: unit tabs (e.g. #IFN501, #CAB201) - only active units are shown.
- Inbox: the unit's "Group Chat" plus a direct chat with each person in that unit.
- The header shows which conversation is open (e.g. "#IFN501 Group Chat").
- Type in the box at the bottom and click "Send". The "+" button attaches a file or image.
- Unread markers show new messages.`
  },
  {
    id: 'profile',
    title: 'Profile & Settings',
    roles: ['coordinator', 'tutor'],
    keywords: ['profile', 'settings', 'photo', 'picture', 'avatar', 'name', 'phone', 'change password', 'id card', 'lanyard', '个人资料', '头像', '改密码', '修改密码', '名字', '电话'],
    content: `Profile & Settings: click your name at the bottom-left of the sidebar (tutors can also use "Edit Profile" on the Dashboard).
- Click the profile picture to upload a new one (JPG, PNG, WEBP or GIF).
- Email is read-only (it is your login).
- Edit First name, Last name, Phone number, then click "Save Profile".
- "Change Password": enter current password and the new one.
- The ID card on the right is a decorative QUT-style Sessioneer card made from your photo and name.`
  },

  // ---------------- Tutor ----------------
  {
    id: 'tutor_dashboard',
    title: 'Tutor Dashboard',
    roles: ['tutor'],
    keywords: ['tutor dashboard', 'dashboard', 'home', 'my units', 'overview', '主页', '首页'],
    content: `Tutor Dashboard shows: Availability status (Submitted / Not submitted), Pending Requests (waiting for approval), and Sessions (number confirmed).
Quick Actions: Sessions, Availability, Schedule, Requests, Messages, Edit Profile. Notifications feed lists recent activity. Switch unit with the Active Unit box at the top of the sidebar.`
  },
  {
    id: 'tutor_sessions',
    title: 'Tutor Sessions page (unit timetable)',
    roles: ['tutor'],
    keywords: ['sessions', 'timetable', 'unit schedule', 'all sessions', '课表', '课程表'],
    content: `Tutor "Sessions" page: "<Unit> - Session Schedule", a Monday-Friday grid of all the unit's sessions with time, code, location and tutor. "(pending)" means that tutor hasn't confirmed yet. Colours: Confirmed, Awaiting confirmation, Unassigned. "Fullscreen" button expands it.`
  },
  {
    id: 'tutor_availability',
    title: 'Submit availability (tutor)',
    roles: ['tutor', 'coordinator'],
    keywords: ['submit availability', 'my availability', 'set availability', 'edit availability', 'fill availability', 'all units', 'how do tutors submit', '提交', '填写', '空闲时间', '可用时间'],
    content: `Tutors submit availability on Availability (sidebar):
- Click "Edit" to turn on edit mode, then set each time slot to Preferred / Available / Avoid.
- "Submit to" dropdown: apply to All Units or one specific unit.
- Summary counts show Preferred / Available / Avoid totals. The info icon explains the rules.
- Save/submit when done. You can change it until the UC locks availability; after that it can't be changed.`
  },
  {
    id: 'tutor_schedule',
    title: 'Tutor Schedule - accept / decline assigned sessions',
    roles: ['tutor'],
    keywords: ['my schedule', 'accept', 'decline', 'confirm session', 'assigned', 'reminder', 'export schedule', '接受', '拒绝', '确认', '我的课'],
    content: `Tutor "Schedule" page lists the sessions assigned to you: Code, Unit, Day, Time, Location, Type, Status.
- New assignments show Accept / Decline in the Action column. Accept = confirm; Decline (give a reason) lets the UC reassign.
- If you do nothing for 3 days you get a reminder email.
- List View / Grid View, and Export to download your schedule.`
  },
  {
    id: 'tutor_requests',
    title: 'Tutor Requests - claim cover, swap or change a session',
    roles: ['tutor'],
    keywords: ['claim', 'claim cover', 'tutors claim', 'tutor claim', 'cover request', 'swap', 'change', 'request', 'give up session', 'my requests', '认领', '代课', '换课', '调课', '请求'],
    content: `Tutor Requests page ("Request & Swap") has 3 tabs:
- Cover Requests: open sessions other tutors can't make (unit, code, day/time, date range, location, type, who gave it up and why). Click "Claim This Session" to take it - first come first served, the UC is emailed.
- Pending Status: your own requests waiting for the UC.
- Confirmation Status: your requests the UC has already actioned (accepted / rejected / suggestion).
Click "+ Request" (top-right) to create a swap or change request for one of your sessions. If the UC suggests an alternative you can accept or reject it. You can delete your own pending request.`
  },

  // ---------------- Admin ----------------
  {
    id: 'admin_users',
    title: 'Admin - user management',
    roles: ['admin', 'coordinator'],
    keywords: ['admin', 'users', 'user management', 'add user', 'disable', 'pending account', 'activate', 'account status', 'reset password link', '管理员', '用户', '禁用', '激活', '账号状态'],
    content: `Admin Console (special admin login, separate from UC/Tutor pages). Users page: see every account with role, status, unit access, created date.
- Search by name, email or unit; filter by role, status, unit.
- "Add User" creates an account. "Modify" edits details, role and status, and sends a reset-password link (admins never set passwords by hand).
- Status: Active (can log in), Pending (can't log in until activated), Disabled (can't log in).
- "Units" on a user opens their unit access: add UC / Tutor / Super Tutor access to a unit (check the semester - the same code can exist in several), or remove it. Main coordinator access may be locked.
UCs: if an account is pending/disabled or needs a role change, ask an admin.`
  },
  {
    id: 'admin_units_sessions',
    title: 'Admin - units, sessions, applications, requests, settings',
    roles: ['admin'],
    keywords: ['admin units', 'admin sessions', 'admin requests', 'admin applications', 'settings', 'cancel cover', '管理员'],
    content: `Admin Units: view/search/filter all units (code, name, main coordinator, semester, enrolment, tutors, sessions, status); Add or Modify a unit; "Tutors" on a unit to add an existing account as Tutor/Super Tutor, change between them, or remove.
Admin Sessions: view/search all sessions, filter by unit, semester, status; add, modify, delete.
Admin Applications: view/search/filter applications across units, download resumes.
Admin Requests: view all requests and cover requests, filter by unit/status (pending, approved, rejected, claimed, cancelled), approve, reject, suggest, or cancel an open cover request.
Settings: placeholder for future admin controls.`
  }
];

// ---------- simple keyword search ----------
const STOPWORDS = new Set(('a an the i me my we our you your to of in on for at by with how do does did can could ' +
  'where what which who when is are was be it this that and or not please want need get go find there here').split(' '));

const tokenize = (text) =>
  text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOPWORDS.has(w));

// Returns the top `limit` sections for this question and role.
const searchKnowledge = (question, role, limit = 3) => {
  const q = question.toLowerCase();
  const qWords = new Set(tokenize(question));

  // No role filter: a UC may ask how things work on the tutor side too.
  // Sections for the asker's own role just get a small boost.
  const scored = SECTIONS
    .map(s => {
      let score = 0;
      for (const kw of s.keywords) {
        if (q.includes(kw.toLowerCase())) score += kw.includes(' ') || /[^\x00-\x7F]/.test(kw) ? 4 : 3;
      }
      for (const w of tokenize(s.title)) if (qWords.has(w)) score += 2;
      for (const w of new Set(tokenize(s.content))) if (qWords.has(w)) score += 0.5;
      // Prefer pages for the asker's own role
      if (score > 0 && role && s.roles.includes(role)) score += 1;
      return { s, score };
    })
    .filter(x => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(x => x.s);
};

module.exports = { OVERVIEW, SECTIONS, searchKnowledge };