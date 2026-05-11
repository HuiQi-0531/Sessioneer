import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.jsx'
import TutorAvailability from './pages/TutorAvailability.jsx';
import TutorSession from './pages/TutorSession.jsx';
import './App.css'

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/availability" element={<TutorAvailability />} />
          <Route path="/session" element={<TutorSession />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App