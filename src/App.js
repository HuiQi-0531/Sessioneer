import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.jsx'
import TutorAvailability from './pages/TutorAvailability.jsx';
import './App.css'

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/availability" element={<TutorAvailability />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App