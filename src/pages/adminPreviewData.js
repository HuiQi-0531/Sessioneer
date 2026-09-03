export const adminUsers = [
  { id: 1, name: 'Alexander Web', email: 'alexander.web@qut.edu.au', roles: ['Administrator', 'Unit Coordinator'], status: 'Active', units: 3 },
  { id: 2, name: 'Michael Jackson', email: 'michael.jackson@qut.edu.au', roles: ['Tutor'], status: 'Active', units: 2 },
  { id: 3, name: 'Chun Yang Gan', email: 'chunyang.gan@qut.edu.au', roles: ['Unit Coordinator', 'Tutor'], status: 'Active', units: 4 },
  { id: 4, name: 'Dinosaur Phan', email: 'dinosaur.phan@qut.edu.au', roles: ['Tutor'], status: 'Pending setup', units: 1 },
  { id: 5, name: 'Jayden Lee', email: 'jayden.lee@qut.edu.au', roles: ['Tutor'], status: 'Inactive', units: 0 }
];

export const adminUnits = [
  { id: 1, code: 'IFN501', name: 'Advanced Software Development', semester: 'Semester 1, 2027', coordinators: 'Alexander Web, Chun Yang Gan', tutors: 5, sessions: 17, status: 'Active' },
  { id: 2, code: 'CAB201', name: 'Capstone', semester: 'Semester 2, 2026', coordinators: 'Chun Yang Gan', tutors: 2, sessions: 8, status: 'Active' },
  { id: 3, code: 'QUT008', name: 'Project Foundations', semester: 'Semester 1, 2027', coordinators: 'Alexander Web', tutors: 0, sessions: 0, status: 'Draft' }
];

export const adminSessions = [
  { id: 1, unit: 'IFN501', day: 'Monday', time: '10:00 - 12:00', type: 'Practical', tutor: 'Michael Jackson', capacity: 40, status: 'Confirmed' },
  { id: 2, unit: 'IFN501', day: 'Tuesday', time: '13:00 - 15:00', type: 'Tutorial', tutor: 'Unassigned', capacity: 25, status: 'Needs tutor' },
  { id: 3, unit: 'CAB201', day: 'Wednesday', time: '09:00 - 11:00', type: 'Workshop', tutor: 'Chun Yang Gan', capacity: 30, status: 'Tentative' },
  { id: 4, unit: 'IFN501', day: 'Thursday', time: '15:00 - 17:00', type: 'Lecture', tutor: 'Dinosaur Phan', capacity: 120, status: 'Awaiting confirmation' }
];

export const adminApplications = [
  { id: 1, unit: 'IFN501', name: 'Sarah Chen', email: 'sarah.chen@qut.edu.au', type: 'Application', status: 'Pending review' },
  { id: 2, unit: 'CAB201', name: 'Jayden Lee', email: 'jayden.lee@qut.edu.au', type: 'Invite', status: 'Pending setup' },
  { id: 3, unit: 'IFN501', name: 'Michael Jackson', email: 'michael.jackson@qut.edu.au', type: 'Invite', status: 'Accepted' }
];

export const adminRequests = [
  { id: 1, unit: 'IFN501', tutor: 'Michael Jackson', request: 'Session swap', status: 'Pending', submitted: 'Today' },
  { id: 2, unit: 'CAB201', tutor: 'Chun Yang Gan', request: 'Cover request', status: 'Claimed', submitted: 'Yesterday' },
  { id: 3, unit: 'IFN501', tutor: 'Dinosaur Phan', request: 'Change request', status: 'Suggested', submitted: '3 days ago' }
];
