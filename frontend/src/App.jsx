import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import Login from './components/Login';
import { api } from './api';
import './App.css';

const AUTH_USER = 'Tracy McGrady';
const AUTH_PASS = '666888';
const AUTH_STORAGE_KEY = 'llmCouncilAuth';
const USER_STORAGE_KEY = 'llmCouncilUser';
const MAX_LOAD_RETRIES = 3;
const RETRY_BASE_MS = 600;

const clearRetry = (ref) => {
  if (ref.current) {
    clearTimeout(ref.current);
    ref.current = null;
  }
};

const scheduleRetry = (ref, fn, attempt) => {
  if (attempt >= MAX_LOAD_RETRIES) return;
  const delay = Math.min(5000, RETRY_BASE_MS * 2 ** attempt);
  clearRetry(ref);
  ref.current = setTimeout(() => fn(attempt + 1), delay);
};

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthed, setIsAuthed] = useState(
    () => localStorage.getItem(AUTH_STORAGE_KEY) === 'true'
  );
  const [authedUser, setAuthedUser] = useState(
    () => localStorage.getItem(USER_STORAGE_KEY) || ''
  );
  const listRetryRef = useRef(null);
  const conversationRetryRef = useRef(null);
  const latestConversationIdRef = useRef(null);

  // Load conversations on mount
  useEffect(() => {
    if (isAuthed) {
      loadConversations();
    }
  }, [isAuthed]);

  // Load conversation details when selected
  useEffect(() => {
    if (isAuthed && currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [isAuthed, currentConversationId]);

  useEffect(() => {
    latestConversationIdRef.current = currentConversationId;
    clearRetry(conversationRetryRef);
  }, [currentConversationId]);

  useEffect(() => {
    return () => {
      clearRetry(listRetryRef);
      clearRetry(conversationRetryRef);
    };
  }, []);

  const loadConversations = async (attempt = 0) => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      scheduleRetry(listRetryRef, loadConversations, attempt);
    }
  };

  const loadConversation = async (id, attempt = 0) => {
    try {
      const conv = await api.getConversation(id);
      if (latestConversationIdRef.current !== id) return;
      setCurrentConversation(conv);
    } catch (error) {
      console.error('Failed to load conversation:', error);
      scheduleRetry(conversationRetryRef, (nextAttempt) => {
        if (latestConversationIdRef.current !== id) return;
        loadConversation(id, nextAttempt);
      }, attempt);
    }
  };

  const handleNewConversation = async () => {
    try {
      const newConv = await api.createConversation();
      setConversations((prev) => [
        { id: newConv.id, created_at: newConv.created_at, message_count: 0 },
        ...prev,
      ]);
      setCurrentConversationId(newConv.id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
  };

  const handleLogin = (username, password) => {
    if (username === AUTH_USER && password === AUTH_PASS) {
      localStorage.setItem(AUTH_STORAGE_KEY, 'true');
      localStorage.setItem(USER_STORAGE_KEY, username);
      setIsAuthed(true);
      setAuthedUser(username);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    clearRetry(listRetryRef);
    clearRetry(conversationRetryRef);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setIsAuthed(false);
    setAuthedUser('');
    setConversations([]);
    setCurrentConversationId(null);
    setCurrentConversation(null);
  };

  const handleSendMessage = async (content) => {
    if (!currentConversationId) return;

    setIsLoading(true);
    try {
      // Optimistically add user message to UI
      const userMessage = { role: 'user', content };
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
      }));

      // Create a partial assistant message that will be updated progressively
      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      // Add the partial assistant message
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }));

      // Send message with streaming
      await api.sendMessageStream(currentConversationId, content, (eventType, event) => {
        switch (eventType) {
          case 'stage1_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage1 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage1_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage1 = event.data;
              lastMsg.loading.stage1 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage2_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage2 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage2_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage2 = event.data;
              lastMsg.metadata = event.metadata;
              lastMsg.loading.stage2 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage3_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage3 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage3_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage3 = event.data;
              lastMsg.loading.stage3 = false;
              return { ...prev, messages };
            });
            break;

          case 'title_complete':
            // Reload conversations to get updated title
            loadConversations();
            break;

          case 'complete':
            // Stream complete, reload conversations list
            loadConversations();
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            setIsLoading(false);
            setCurrentConversation((prev) => {
              if (!prev || !prev.messages?.length) return prev;
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              const isAssistant = lastMsg?.role === 'assistant';
              const isEmpty =
                !lastMsg?.stage1 && !lastMsg?.stage2 && !lastMsg?.stage3;
              const isNotLoading =
                !lastMsg?.loading?.stage1 &&
                !lastMsg?.loading?.stage2 &&
                !lastMsg?.loading?.stage3;
              if (isAssistant && isEmpty && isNotLoading) {
                messages.pop();
                return { ...prev, messages };
              }
              return prev;
            });
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove optimistic messages on error
      setCurrentConversation((prev) => ({
        ...prev,
        messages: prev.messages.slice(0, -2),
      }));
      setIsLoading(false);
    }
  };

  if (!isAuthed) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        userName={authedUser || AUTH_USER}
        onLogout={handleLogout}
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
      />
    </div>
  );
}

export default App;
