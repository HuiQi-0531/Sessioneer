import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/TutorSession.css';

const TutorSession = () => {

    const [fullscreen, setFullscreen] = useState(false);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const compactTimeSlots = [
        '8am',
        '9am',
        '10am',
        '11am',
        '12pm',
        '1pm',
        '2pm',
        '3pm',
        '4pm',
        '5pm'
    ];

    const fullTimeSlots = [
        '8am',
        '9am',
        '10am',
        '11am',
        '12pm',
        '1pm',
        '2pm',
        '3pm',
        '4pm',
        '5pm',
        '6pm',
        '7pm',
        '8pm',
        '9pm'
    ];

    const timeSlots = fullscreen
        ? fullTimeSlots
        : compactTimeSlots;

    const sessions = [
        {
            title: 'Lecture',
            code: 'GP-0603',
            tutor: 'Alex Chen',
            day: 0,
            start: 0,
            duration: 2,
            color: 'green'
        },
        {
            title: 'Lecture',
            code: 'GP-0407',
            tutor: 'Unassigned',
            day: 2,
            start: 1,
            duration: 2,
            color: 'red'
        },
        {
            title: 'TUT02',
            code: 'GP-0407',
            tutor: 'Michael',
            day: 4,
            start: 0,
            duration: 2,
            color: 'yellow'
        },
        {
            title: 'TUT02',
            code: 'GP-0407',
            tutor: 'Sam Rivera',
            day: 1,
            start: 2,
            duration: 2,
            color: 'yellow'
        },
        {
            title: 'TUT03',
            code: 'GP-0407',
            tutor: 'Jordan Yu',
            day: 2,
            start: 3,
            duration: 2,
            color: 'green'
        },
        {
            title: 'TUT06',
            code: 'GP-0407',
            tutor: 'Unassigned',
            day: 3,
            start: 4,
            duration: 2,
            color: 'red'
        },
        {
            title: 'TUT05',
            code: 'GP-0603',
            tutor: 'Jordan Yu',
            day: 1,
            start: 5,
            duration: 2,
            color: 'green'
        },
        {
            title: 'TUT05',
            code: 'GP-0603',
            tutor: 'Michael',
            day: 3,
            start: 6,
            duration: 2,
            color: 'green'
        },
        {
            title: 'TUT04',
            code: 'GP-0407',
            tutor: 'Unassigned',
            day: 2,
            start: 7,
            duration: 2,
            color: 'yellow'
        },
        {
            title: 'TUT04',
            code: 'GP-0407',
            tutor: 'Unassigned',
            day: 0,
            start: 8,
            duration: 2,
            color: 'yellow'
        }
    ];

    return (
        <div className="dashboard-container">

            {/* Sidebar */}
            {!fullscreen && (
                <aside className="sidebar">

                    <div className="logo-section">
                        <div className="logo">
                            <span className="logo-icon">S</span>
                        </div>

                        <h2 className="brand-name">Sessioneer</h2>
                    </div>

                    <nav className="navigation">

                        <Link to="/" className="nav-item">
                            Dashboard
                        </Link>

                        <Link to="/sessions" className="nav-item active">
                            Sessions
                        </Link>

                        <Link to="/availability" className="nav-item">
                            Availability
                        </Link>

                        <a href="#schedule-builder" className="nav-item">
                            Schedule
                        </a>

                        <Link to="/requests" className="nav-item">
                            Requests
                        </Link>

                        <a href="#messages" className="nav-item">
                            Messages
                        </a>

                    </nav>

                    <div className="user-profile">

                        <div className="user-avatar">
                            L
                        </div>

                        <div className="user-info">
                            <p className="user-name">Elaine Lee</p>
                            <p className="user-role">Tutor</p>
                        </div>

                    </div>

                </aside>
            )}

            {/* Main Content */}
            <main className={`main-content ${fullscreen ? 'fullscreen-main' : ''}`}>

                {!fullscreen && (
                    <header className="header">

                        <h1>Sessions</h1>

                        <button className="notification-btn">
                            🔔
                        </button>

                    </header>
                )}

                <div className={`sessions-wrapper ${fullscreen ? 'fullscreen-wrapper' : ''}`}>

                    <div className={`sessions-card ${fullscreen ? 'fullscreen-card' : ''}`}>

                        <div className="sessions-top">

                            <div>
                                <h3 className="sessions-title">
                                    Session Schedule
                                </h3>

                                <p className="sessions-subtitle">
                                    View your allocated classes and tutoring sessions
                                </p>
                            </div>

                        </div>

                        {/* Timetable */}
                        <div className="timetable-wrapper">

                            {/* Header */}
                            <div className="timetable-days">

                                <div className="time-header"></div>

                                {days.map((day) => (
                                    <div key={day} className="day-header">
                                        {day}
                                    </div>
                                ))}

                            </div>

                            {/* Grid */}
                            <div className="timetable-grid">

                                {/* Time */}
                                <div className="time-column">

                                    {timeSlots.map((time) => (
                                        <div key={time} className="time-slot-label">
                                            {time}
                                        </div>
                                    ))}

                                </div>

                                {/* Calendar */}
                                <div className="calendar-grid">

                                    {days.map((day, dayIndex) => (
                                        <div key={dayIndex} className="calendar-column">

                                            {timeSlots.map((time, index) => (
                                                <div key={index} className="calendar-cell"></div>
                                            ))}

                                            {sessions
                                                .filter((session) => session.day === dayIndex)
                                                .map((session, index) => (

                                                    <div
                                                        key={index}
                                                        className={`session-event-card ${session.color}`}
                                                        style={{
                                                            top: `${session.start * (fullscreen ? 50 : 70)}px`,
                                                            height: `${session.duration * (fullscreen ? 50 : 70)}px`
                                                        }}
                                                    >

                                                        <h4>{session.title}</h4>

                                                        <p>{session.code}</p>

                                                        <span>{session.tutor}</span>

                                                    </div>

                                                ))}

                                        </div>
                                    ))}

                                </div>

                            </div>

                        </div>

                        {/* Fullscreen Button */}
                        <div className="fullscreen-btn-container">

                            <button
                                className="fullscreen-btn"
                                onClick={() => setFullscreen(!fullscreen)}
                            >
                                {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                            </button>

                        </div>

                    </div>

                </div>

            </main>

        </div>
    );
};

export default TutorSession;