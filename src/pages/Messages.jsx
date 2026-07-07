import React, { useState, useEffect, useRef, useCallback } from 'react';
import { messagesAPI, sessionsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import '../styles/UCRequests.css';
import '../styles/Messages.css';

const POLL_INTERVAL_MS = 4000;

const Messages = () => {
  const { allUnits, activeUnit, isLoading: unitsLoading } = useActiveUnit();

  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(true);
  const [groupUnreadCount, setGroupUnreadCount] = useState(0);

  // chatMode: 'group' | 'direct' | null
  const [chatMode, setChatMode] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [thread, setThread] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [showProfile, setShowProfile] = useState(false);
  const [profileSessions, setProfileSessions] = useState([]);

  const threadEndRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!selectedUnitId && activeUnit) {
      setSelectedUnitId(activeUnit.id);
    }
  }, [activeUnit, selectedUnitId]);

  const loadContacts = useCallback(async (unitId) => {
    try {
      const data = await messagesAPI.getUnitContacts(unitId);
      data.sort((a, b) => {
        if (!a.lastMessageAt && !b.lastMessageAt) return a.name.localeCompare(b.name);
        if (!a.lastMessageAt) return 1;
        if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
      });
      setContacts(data);
    } catch (err) {
      console.error('Error loading contacts:', err);
    }
  }, []);

  const loadGroupUnreadCount = useCallback(async (unitId) => {
    try {
      const data = await messagesAPI.getGroupUnreadCount(unitId);
      setGroupUnreadCount(data.unreadCount);
    } catch (err) {
      console.error('Error loading group unread count:', err);
    }
  }, []);

  // When the selected unit changes, open its group chat directly
  useEffect(() => {
    if (!selectedUnitId) return;
    setIsLoadingContacts(true);
    loadContacts(selectedUnitId).finally(() => setIsLoadingContacts(false));
    loadGroupUnreadCount(selectedUnitId);
    setShowProfile(false);
    openGroupChat(selectedUnitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitId]);

  const loadDirectThread = useCallback(async (otherUserId) => {
    try {
      const data = await messagesAPI.getThread(otherUserId);
      setThread(data);
    } catch (err) {
      console.error('Error loading thread:', err);
    }
  }, []);

  const loadGroupThread = useCallback(async (unitId) => {
    try {
      const data = await messagesAPI.getGroupThread(unitId);
      setThread(data);
    } catch (err) {
      console.error('Error loading group thread:', err);
    }
  }, []);

  const openGroupChat = async (unitId) => {
    setChatMode('group');
    setSelectedContact(null);
    setShowProfile(false);
    await loadGroupThread(unitId);
    try {
      await messagesAPI.markGroupRead(unitId);
      await loadGroupUnreadCount(unitId);
    } catch (err) {
      console.error('Error marking group chat read:', err);
    }
  };

  const openContact = async (contact) => {
    setChatMode('direct');
    setSelectedContact(contact);
    setShowProfile(false);
    await loadDirectThread(contact.userId);
    try {
      await messagesAPI.markRead(contact.userId);
      await loadContacts(selectedUnitId);
    } catch (err) {
      console.error('Error marking read:', err);
    }
  };

  // Poll whichever chat is open, plus contacts/unread counts, while this page is open
  useEffect(() => {
    pollRef.current = setInterval(() => {
      if (chatMode === 'direct' && selectedContact) {
        loadDirectThread(selectedContact.userId);
      }
      if (chatMode === 'group' && selectedUnitId) {
        loadGroupThread(selectedUnitId);
      }
      if (selectedUnitId) {
        loadContacts(selectedUnitId);
        loadGroupUnreadCount(selectedUnitId);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(pollRef.current);
  }, [chatMode, selectedContact, selectedUnitId, loadDirectThread, loadGroupThread, loadContacts, loadGroupUnreadCount]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    setIsSending(true);
    try {
      if (chatMode === 'group') {
        await messagesAPI.sendGroup(selectedUnitId, newMessage.trim());
        setNewMessage('');
        await loadGroupThread(selectedUnitId);
      } else if (chatMode === 'direct' && selectedContact) {
        await messagesAPI.send(selectedContact.userId, newMessage.trim());
        setNewMessage('');
        await loadDirectThread(selectedContact.userId);
        await loadContacts(selectedUnitId);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const openProfile = async () => {
    if (chatMode !== 'direct' || !selectedContact) return;
    setShowProfile(true);
    try {
      const sessions = await sessionsAPI.getAll(selectedUnitId);
      setProfileSessions(sessions.filter(s => s.assignedTutorId === selectedContact.userId));
    } catch (err) {
      console.error('Error loading profile sessions:', err);
    }
  };

  const formatTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const selectedUnit = allUnits.find(u => u.id === selectedUnitId);

  if (unitsLoading) {
    return (
      <div className="uc-dashboard-container">
        <UCSidebar activePage="messages" />
        <main className="uc-main-content">
          <div className="msg-empty-chat">Loading...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="uc-dashboard-container">
      <UCSidebar activePage="messages" />

      <main className="uc-main-content">
        <header className="uc-header">
          <h1>Messages</h1>
        </header>

        <div className="msg-container">
          <div className="msg-units-col">
            {allUnits.map(unit => (
              <div
                key={unit.id}
                className={`msg-unit-item ${selectedUnitId === unit.id ? 'active' : ''}`}
                onClick={() => setSelectedUnitId(unit.id)}
              >
                #{unit.unitCode}
              </div>
            ))}
          </div>

          <div className="msg-inbox-col">
            <div className="msg-inbox-header">Inbox</div>
            <div className="msg-inbox-list">
              <div
                className={`msg-contact-item ${chatMode === 'group' ? 'selected' : ''} ${groupUnreadCount > 0 ? 'has-unread' : ''}`}
                onClick={() => selectedUnitId && openGroupChat(selectedUnitId)}
              >
                <span className="msg-contact-name">Group Chat</span>
                {groupUnreadCount > 0 && <span className="msg-unread-badge">{groupUnreadCount}</span>}
              </div>

              {isLoadingContacts ? (
                <div style={{ padding: 16, color: '#9ca3af', fontSize: 13 }}>Loading...</div>
              ) : (
                contacts.map(contact => (
                  <div
                    key={contact.userId}
                    className={`msg-contact-item ${chatMode === 'direct' && selectedContact?.userId === contact.userId ? 'selected' : ''} ${contact.unreadCount > 0 ? 'has-unread' : ''}`}
                    onClick={() => openContact(contact)}
                  >
                    <span className="msg-contact-name">{contact.name}</span>
                    {contact.unreadCount > 0 && <span className="msg-unread-badge">{contact.unreadCount}</span>}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="msg-chat-col">
            {!chatMode ? (
              <div className="msg-empty-chat">Select a unit to open its group chat, or a tutor to message directly.</div>
            ) : (
              <>
                <div className="msg-chat-header" onClick={openProfile} style={{ cursor: chatMode === 'direct' ? 'pointer' : 'default' }}>
                  {chatMode === 'group'
                    ? `#${selectedUnit?.unitCode} Group Chat`
                    : `#${selectedUnit?.unitCode} - ${selectedContact?.name}`}
                </div>
                <div className="msg-thread">
                  {thread.map(m => (
                    <div key={m.id} className={`msg-bubble-row ${m.isMine ? 'mine' : 'theirs'}`}>
                      <div className="msg-bubble-meta">
                        {m.isMine ? 'You' : (chatMode === 'group' ? m.senderName : selectedContact?.name)} - {formatTime(m.sentAt)}
                      </div>
                      <div className="msg-bubble">{m.content}</div>
                    </div>
                  ))}
                  <div ref={threadEndRef} />
                </div>
                <div className="msg-input-row">
                  <input
                    type="text"
                    placeholder="Send Message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                  />
                  <button className="msg-send-btn" onClick={handleSend} disabled={isSending || !newMessage.trim()}>
                    Send
                  </button>
                </div>
              </>
            )}
          </div>

          {showProfile && chatMode === 'direct' && selectedContact && (
            <div className="msg-profile-col">
              <button className="msg-profile-close" onClick={() => setShowProfile(false)}>&times;</button>
              <div className="msg-profile-avatar">{selectedContact.name.charAt(0).toUpperCase()}</div>
              <div className="msg-profile-name">{selectedContact.name}</div>
              <div className="msg-profile-role">Tutor</div>

              <div className="msg-profile-info-row">
                <span className="msg-profile-info-label">Email</span>
                {selectedContact.email}
              </div>
              <div className="msg-profile-info-row">
                <span className="msg-profile-info-label">Active Unit</span>
                {selectedUnit ? selectedUnit.unitCode : '-'}
              </div>

              <div className="msg-profile-sessions-title">Sessions in this unit</div>
              {profileSessions.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9ca3af' }}>No sessions assigned yet.</div>
              ) : (
                profileSessions.map(s => (
                  <div key={s.id} className="msg-profile-session-card">
                    <div className="msg-profile-session-day">
                      <span>{s.day}</span>
                      <span>{s.startTime.slice(0, 5)}-{s.endTime.slice(0, 5)}</span>
                    </div>
                    <div className="msg-profile-session-meta">{s.location || 'No location'} - {s.sessionType || 'Session'}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Messages;