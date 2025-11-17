/**
 * Toast utilities
 * Helper functions to show toast notifications
 */

// Helper function to show toast from anywhere in the app
export const showToast = (message, type = 'info', duration = 3000) => {
  const event = new CustomEvent('show-toast', {
    detail: { message, type, duration }
  });
  window.dispatchEvent(event);
};

export const showSuccess = (message, duration = 3000) => {
  showToast(message, 'success', duration);
};

export const showError = (message, duration = 4000) => {
  showToast(message, 'error', duration);
};

export const showWarning = (message, duration = 3500) => {
  showToast(message, 'warning', duration);
};

export const showInfo = (message, duration = 3000) => {
  showToast(message, 'info', duration);
};
