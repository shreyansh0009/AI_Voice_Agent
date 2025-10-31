/**
 * Utility functions for managing chat history in localStorage
 */

const CHAT_HISTORY_KEY = 'agent_chat_history';
const TEST_CHAT_HISTORY_KEY = 'test_chat_history';
const MAX_MESSAGES = 100; // Maximum messages to store
const EXPIRY_DAYS = 7; // Chat history expires after 7 days

/**
 * Save chat history to localStorage
 * @param {Array} messages - Array of message objects
 * @param {string} key - Storage key (optional)
 */
export const saveChatHistory = (messages, key = CHAT_HISTORY_KEY) => {
  try {
    // Limit the number of messages to prevent localStorage overflow
    const limitedMessages = messages.slice(-MAX_MESSAGES);
    
    const data = {
      messages: limitedMessages,
      timestamp: Date.now(),
    };
    
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Failed to save chat history:', error);
    
    // If quota exceeded, try to clear old data
    if (error.name === 'QuotaExceededError') {
      clearExpiredChats();
      // Try again with fewer messages
      try {
        const reducedMessages = messages.slice(-50);
        const data = {
          messages: reducedMessages,
          timestamp: Date.now(),
        };
        localStorage.setItem(key, JSON.stringify(data));
        return true;
      } catch (retryError) {
        console.error('Failed to save chat history after retry:', retryError);
        return false;
      }
    }
    
    return false;
  }
};

/**
 * Load chat history from localStorage
 * @param {string} key - Storage key (optional)
 * @returns {Array} - Array of message objects
 */
export const loadChatHistory = (key = CHAT_HISTORY_KEY) => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    
    const data = JSON.parse(stored);
    
    // Check if data has expired
    const expiryTime = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - data.timestamp > expiryTime) {
      // Data expired, clear it
      localStorage.removeItem(key);
      return [];
    }
    
    return data.messages || [];
  } catch (error) {
    console.error('Failed to load chat history:', error);
    return [];
  }
};

/**
 * Clear specific chat history
 * @param {string} key - Storage key (optional)
 */
export const clearChatHistory = (key = CHAT_HISTORY_KEY) => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('Failed to clear chat history:', error);
    return false;
  }
};

/**
 * Clear all chat histories
 */
export const clearAllChatHistories = () => {
  try {
    localStorage.removeItem(CHAT_HISTORY_KEY);
    localStorage.removeItem(TEST_CHAT_HISTORY_KEY);
    return true;
  } catch (error) {
    console.error('Failed to clear all chat histories:', error);
    return false;
  }
};

/**
 * Clear expired chat histories
 */
export const clearExpiredChats = () => {
  const keys = [CHAT_HISTORY_KEY, TEST_CHAT_HISTORY_KEY];
  const expiryTime = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  
  keys.forEach(key => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const data = JSON.parse(stored);
        if (Date.now() - data.timestamp > expiryTime) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error(`Failed to check expiry for ${key}:`, error);
    }
  });
};

/**
 * Get storage stats
 * @returns {Object} - Storage statistics
 */
export const getStorageStats = () => {
  try {
    const mainChat = localStorage.getItem(CHAT_HISTORY_KEY);
    const testChat = localStorage.getItem(TEST_CHAT_HISTORY_KEY);
    
    return {
      mainChatSize: mainChat ? new Blob([mainChat]).size : 0,
      testChatSize: testChat ? new Blob([testChat]).size : 0,
      mainChatMessages: mainChat ? JSON.parse(mainChat).messages.length : 0,
      testChatMessages: testChat ? JSON.parse(testChat).messages.length : 0,
    };
  } catch (error) {
    console.error('Failed to get storage stats:', error);
    return null;
  }
};

// Export constants
export const STORAGE_KEYS = {
  MAIN_CHAT: CHAT_HISTORY_KEY,
  TEST_CHAT: TEST_CHAT_HISTORY_KEY,
};

export const STORAGE_LIMITS = {
  MAX_MESSAGES,
  EXPIRY_DAYS,
};
