import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import TutorAvailability from './pages/TutorAvailability.jsx';
import TutorDashboard from './pages/TutorDashboard.jsx';
import TutorSession from './pages/TutorSession.jsx';
import TutorMessages from './pages/TutorMessages.jsx';
import UCDashboard from './pages/UCDashboard.jsx';
import Profile from './pages/Profile.jsx';
import LogoutConfirm from './pages/LogoutConfirm.jsx';
import TutorApply from './pages/TutorApply.jsx';
import SetPassword from './pages/SetPassword.jsx';
import TutorApplications from './pages/TutorApplications.jsx';
import ApplicationFormEditor from './pages/ApplicationFormEditor.jsx';
import TutorRequests from './pages/TutorRequests.jsx';
import UCRequests from './pages/UCRequests.jsx';
import UCAvailability from './pages/UCAvailability.jsx';
import UnitSetup from './pages/UnitSetup.jsx';
import CreateUnit from './pages/CreateUnit.jsx';
import Sessions from './pages/Sessions.jsx';
import ImportSessions from './pages/ImportSessions.jsx';
import Tutors from './pages/Tutors.jsx';
import ScheduleBuilder from './pages/ScheduleBuilder.jsx';
import Messages from './pages/Messages.jsx';
import TutorSchedule from './pages/TutorSchedule.jsx';
import TutorUnits from './pages/TutorUnits.jsx';
import Register from './pages/Register';
import Login from './pages/Login';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminUnits from './pages/AdminUnits.jsx';
import AdminSessions from './pages/AdminSessions.jsx';
import AdminApplications from './pages/AdminApplications.jsx';
import AdminRequests from './pages/AdminRequests.jsx';
import AdminSettings from './pages/AdminSettings.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import BotWidget from './components/BotWidget.jsx';
import { ActiveUnitProvider } from './context/ActiveUnitContext.jsx';
import './App.css'

function App() {
  return (
    <Router>
      <div className="App">
        <ActiveUnitProvider>
          <BotWidget />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/tutor-dashboard" element={
            <ProtectedRoute allowedRoles={['tutor']}><TutorDashboard /></ProtectedRoute>
          } />
          <Route path="/availability" element={
            <ProtectedRoute><TutorAvailability /></ProtectedRoute>
          } />
          <Route path="/requests" element={
            <ProtectedRoute><TutorRequests /></ProtectedRoute>
          } />
          <Route path="/uc-requests" element={
            <ProtectedRoute allowedRoles={['coordinator']}><UCRequests /></ProtectedRoute>
          } />
          <Route path="/uc-availability" element={
            <ProtectedRoute allowedRoles={['coordinator']}><UCAvailability /></ProtectedRoute>
          } />
          <Route path="/unit-setup" element={
            <ProtectedRoute allowedRoles={['coordinator']}><UnitSetup /></ProtectedRoute>
          } />
          <Route path="/unit-setup/create" element={
            <ProtectedRoute allowedRoles={['coordinator']}><CreateUnit /></ProtectedRoute>
          } />
          <Route path="/unit-setup/edit/:id" element={
            <ProtectedRoute allowedRoles={['coordinator']}><CreateUnit /></ProtectedRoute>
          } />
          <Route path="/sessions" element={
            <ProtectedRoute allowedRoles={['coordinator']}><Sessions /></ProtectedRoute>
          } />
          <Route path="/sessions/:unitId" element={
            <ProtectedRoute allowedRoles={['coordinator']}><Sessions /></ProtectedRoute>
          } />
          <Route path="/sessions/import" element={
            <ProtectedRoute allowedRoles={['coordinator']}><ImportSessions /></ProtectedRoute>
          } />
          <Route path="/sessions/:unitId/import" element={
            <ProtectedRoute allowedRoles={['coordinator']}><ImportSessions /></ProtectedRoute>
          } />
          <Route path="/tutors" element={
            <ProtectedRoute allowedRoles={['coordinator']}><Tutors /></ProtectedRoute>
          } />
          <Route path="/tutors/:unitId" element={
            <ProtectedRoute allowedRoles={['coordinator']}><Tutors /></ProtectedRoute>
          } />
          <Route path="/schedule-builder" element={
            <ProtectedRoute allowedRoles={['coordinator']}><ScheduleBuilder /></ProtectedRoute>
          } />
          <Route path="/schedule-builder/:unitId" element={
            <ProtectedRoute allowedRoles={['coordinator']}><ScheduleBuilder /></ProtectedRoute>
          } />
          <Route path="/messages" element={
            <ProtectedRoute allowedRoles={['coordinator']}><Messages /></ProtectedRoute>
          } />
          <Route path="/tutor-schedule" element={
            <ProtectedRoute allowedRoles={['tutor']}><TutorSchedule /></ProtectedRoute>
          } />
          <Route path="/tutor-schedule/:unitId" element={
            <ProtectedRoute allowedRoles={['tutor']}><TutorSchedule /></ProtectedRoute>
          } />
          <Route path="/tutor-sessions" element={
            <ProtectedRoute allowedRoles={['tutor']}><TutorSession /></ProtectedRoute>
          } />
          <Route path="/tutor-sessions/:unitId" element={
            <ProtectedRoute allowedRoles={['tutor']}><TutorSession /></ProtectedRoute>
          } />
          <Route path="/tutor-messages" element={
            <ProtectedRoute allowedRoles={['tutor']}><TutorMessages /></ProtectedRoute>
          } />
          <Route path="/tutor-units" element={
            <ProtectedRoute allowedRoles={['tutor']}><TutorUnits /></ProtectedRoute>
          } />
          <Route path="/uc-dashboard" element={
            <ProtectedRoute allowedRoles={['coordinator']}><UCDashboard /></ProtectedRoute>
          } />
          <Route path="/admin-dashboard" element={
            <ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>
          } />
          <Route path="/admin/units" element={
            <ProtectedRoute allowedRoles={['admin']}><AdminUnits /></ProtectedRoute>
          } />
          <Route path="/admin/sessions" element={
            <ProtectedRoute allowedRoles={['admin']}><AdminSessions /></ProtectedRoute>
          } />
          <Route path="/admin/applications" element={
            <ProtectedRoute allowedRoles={['admin']}><AdminApplications /></ProtectedRoute>
          } />
          <Route path="/admin/requests" element={
            <ProtectedRoute allowedRoles={['admin']}><AdminRequests /></ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute allowedRoles={['admin']}><AdminSettings /></ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute><Profile /></ProtectedRoute>
          } />
          <Route path="/logout" element={
            <ProtectedRoute><LogoutConfirm /></ProtectedRoute>
          } />
          <Route path="/apply" element={<TutorApply />} />
          <Route path="/activate/:token" element={<SetPassword />} />
          <Route path="/tutor-applications" element={
            <ProtectedRoute allowedRoles={['coordinator']}><TutorApplications /></ProtectedRoute>
          } />
          <Route path="/tutor-applications/form" element={
            <ProtectedRoute allowedRoles={['coordinator']}><ApplicationFormEditor /></ProtectedRoute>
          } />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
        </ActiveUnitProvider>
      </div>
    </Router>
  );
}

export default App
