import React, { useState, useEffect, useRef, useCallback } from 'react';
import { messagesAPI, sessionsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import { getSocket } from '../utils/socket';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/Messages.css';

const POLL_INTERVAL_MS = 30000;
const ATTACHMENT_ACCEPT = 'image/*,.pdf,.doc,.docx,.csv,.xls,.xlsx';
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

const TutorMessages = () => {
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
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const [showProfile, setShowProfile] = useState(false);
  const [profileSessions, setProfileSessions] = useState([]);

  const threadEndRef = useRef(null);
  const pollRef = useRef(null);
  const attachmentInputRef = useRef(null);

  const currentUser = React.useMemo(() => {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  }, []);

  const appendMessage = useCallback((message) => {
    setThread(prev => {
      if (prev.some(m => m.id === message.id)) return prev;
      return [...prev, message];
    });
  }, []);

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

  useEffect(() => {
    if (!selectedUnitId) return;
    setIsLoadingContacts(true);
    loadContacts(selectedUnitId).finally(() => setIsLoadingContacts(false));
    loadGroupUnreadCount(selectedUnitId);
    setShowProfile(false);
    openGroupChat(selectedUnitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitId]);

  useEffect(() => {
    if (!selectedUnitId) return;

    const socket = getSocket();
    if (!socket) return;

    socket.emit('join-unit', selectedUnitId);
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
    const socket = getSocket();
    if (!socket || !currentUser) return;

    const handleDirectMessage = (message) => {
      const otherUserId = message.senderId === currentUser.id ? message.recipientId : message.senderId;
      const normalisedMessage = {
        ...message,
        isMine: message.senderId === currentUser.id
      };

      if (chatMode === 'direct' && selectedContact?.userId === otherUserId) {
        appendMessage(normalisedMessage);
        messagesAPI.markRead(otherUserId).catch(err => console.error('Error marking read:', err));
      }

      if (selectedUnitId) {
        loadContacts(selectedUnitId);
      }
    };

    const handleGroupMessage = ({ unitId, message }) => {
      const normalisedMessage = {
        ...message,
        isMine: message.senderId === currentUser.id
      };

      if (unitId === selectedUnitId && chatMode === 'group') {
        appendMessage(normalisedMessage);
        messagesAPI.markGroupRead(unitId).catch(err => console.error('Error marking group read:', err));
      } else if (unitId === selectedUnitId) {
        loadGroupUnreadCount(unitId);
      }
    };

    socket.on('direct-message', handleDirectMessage);
    socket.on('group-message', handleGroupMessage);

    return () => {
      socket.off('direct-message', handleDirectMessage);
      socket.off('group-message', handleGroupMessage);
    };
  }, [
    appendMessage,
    chatMode,
    currentUser,
    selectedContact,
    selectedUnitId,
    loadContacts,
    loadGroupUnreadCount
  ]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  useEffect(() => {
    return () => {
      if (attachmentPreview?.url) {
        URL.revokeObjectURL(attachmentPreview.url);
      }
    };
  }, [attachmentPreview]);

  const formatAttachmentSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const clearAttachment = () => {
    if (attachmentPreview?.url) {
      URL.revokeObjectURL(attachmentPreview.url);
    }
    setSelectedAttachment(null);
    setAttachmentPreview(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
  };

  const handleAttachmentChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_SIZE) {
      alert('File is too large. Please choose a file under 5 MB.');
      clearAttachment();
      return;
    }

    if (attachmentPreview?.url) {
      URL.revokeObjectURL(attachmentPreview.url);
    }

    setSelectedAttachment(file);
    setAttachmentPreview({
      name: file.name,
      type: file.type,
      size: file.size,
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    });
  };

  const renderAttachment = (message) => {
    if (!message.attachmentUrl) return null;
    const isImage = message.attachmentType?.startsWith('image/');

    if (isImage) {
      return (
        <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="msg-attachment-image-link">
          <img src={message.attachmentUrl} alt={message.attachmentName || 'Attachment'} className="msg-attachment-image" />
        </a>
      );
    }

    return (
      <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="msg-attachment-file">
        <span className="msg-attachment-icon">+</span>
        <span>
          <span className="msg-attachment-name">{message.attachmentName || 'Attachment'}</span>
          <span className="msg-attachment-size">{formatAttachmentSize(message.attachmentSize)}</span>
        </span>
      </a>
    );
  };

  const handleSend = async () => {
    if (!newMessage.trim() && !selectedAttachment) return;
    setIsSending(true);
    try {
      if (chatMode === 'group') {
        await messagesAPI.sendGroup(selectedUnitId, newMessage.trim(), selectedAttachment);
        setNewMessage('');
        clearAttachment();
        await loadGroupThread(selectedUnitId);
      } else if (chatMode === 'direct' && selectedContact) {
        await messagesAPI.send(selectedContact.userId, newMessage.trim(), selectedAttachment);
        setNewMessage('');
        clearAttachment();
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
        <TutorSidebar activePage="messages" />
        <main className="uc-main-content">
          <div className="msg-empty-chat">Loading...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="uc-dashboard-container">
      <TutorSidebar activePage="messages" />

      <main className="uc-main-content">
        <UCPageHeader title="Messages" />

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
              <div className="msg-empty-chat">Select a unit to open its group chat, or a contact to message directly.</div>
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
                      <div className="msg-bubble">
                        {m.content && <div className="msg-bubble-text">{m.content}</div>}
                        {renderAttachment(m)}
                      </div>
                    </div>
                  ))}
                  <div ref={threadEndRef} />
                </div>
                {attachmentPreview && (
                  <div className="msg-attachment-preview">
                    {attachmentPreview.url ? (
                      <img src={attachmentPreview.url} alt={attachmentPreview.name} />
                    ) : (
                      <span className="msg-attachment-preview-icon">+</span>
                    )}
                    <div>
                      <div className="msg-attachment-preview-name">{attachmentPreview.name}</div>
                      <div className="msg-attachment-preview-size">{formatAttachmentSize(attachmentPreview.size)}</div>
                    </div>
                    <button type="button" onClick={clearAttachment} aria-label="Remove attachment">&times;</button>
                  </div>
                )}
                <div className="msg-input-row">
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    className="msg-file-input"
                    onChange={handleAttachmentChange}
                  />
                  <button
                    type="button"
                    className="msg-attach-btn"
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={isSending}
                    title="Attach file"
                  >
                    +
                  </button>
                  <input
                    type="text"
                    placeholder="Send Message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                  />
                  <button className="msg-send-btn" onClick={handleSend} disabled={isSending || (!newMessage.trim() && !selectedAttachment)}>
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
              <div className="msg-profile-role">Contact</div>

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

export default TutorMessages;
