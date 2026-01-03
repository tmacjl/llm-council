/**
 * API client for the LLM Council backend.
 */

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001').replace(
    /\/+$/,
    ''
  );

export const api = {
  /**
   * List all conversations.
   */
  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`);
    if (!response.ok) {
      throw new Error('Failed to list conversations');
    }
    return response.json();
  },

  /**
   * Create a new conversation.
   */
  async createConversation() {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }
    return response.json();
  },

  /**
   * Get a specific conversation.
   */
  async getConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`
    );
    if (!response.ok) {
      throw new Error('Failed to get conversation');
    }
    return response.json();
  },

  /**
   * Send a message in a conversation.
   */
  async sendMessage(conversationId, content) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to send message');
    }
    return response.json();
  },

  /**
   * Send a message and receive streaming updates.
   * @param {string} conversationId - The conversation ID
   * @param {string} content - The message content
   * @param {function} onEvent - Callback function for each event: (eventType, data) => void
   * @returns {Promise<void>}
   */
  async sendMessageStream(conversationId, content, onEvent) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    if (!response.body) {
      throw new Error('Stream not available');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedEvent = false;
    let sawTerminalEvent = false;

    const handleEvent = (event) => {
      receivedEvent = true;
      if (event.type === 'complete' || event.type === 'error') {
        sawTerminalEvent = true;
      }
      onEvent(event.type, event);
    };

    const processBuffer = () => {
      buffer = buffer.replace(/\r/g, '');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        if (!rawEvent.trim()) {
          continue;
        }

        const dataLines = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'));
        if (dataLines.length === 0) {
          continue;
        }

        const data = dataLines
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        try {
          const event = JSON.parse(data);
          handleEvent(event);
        } catch (e) {
          console.error('Failed to parse SSE event:', e);
        }
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
      }

      buffer += decoder.decode();
      processBuffer();
    } catch (error) {
      if (receivedEvent) {
        handleEvent({ type: 'error', message: error?.message || 'Stream error' });
        return;
      }
      throw error;
    }

    if (!sawTerminalEvent) {
      if (receivedEvent) {
        handleEvent({ type: 'error', message: 'Stream ended unexpectedly' });
        return;
      }
      throw new Error('Stream ended unexpectedly');
    }
  },
};
