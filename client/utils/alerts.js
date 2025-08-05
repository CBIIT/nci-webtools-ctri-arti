import { createStore } from "solid-js/store";

// Global alert state
const [alerts, setAlerts] = createStore([]);

/**
 * Generate a unique ID for alerts
 * @returns {string} Unique alert ID
 */
function generateAlertId() {
  return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Show an alert
 * @param {object} options - Alert options
 * @param {string} options.message - Alert message
 * @param {string} options.type - Alert type ('danger', 'warning', 'success', 'info')
 * @param {boolean} options.dismissible - Whether alert can be dismissed (default: true)
 * @param {number} options.autoDismiss - Auto-dismiss timeout in ms (default: 5000)
 * @returns {string} Alert ID
 */
export function showAlert({ message, type = 'info', dismissible = true, autoDismiss = 5000 }) {
  const id = generateAlertId();
  
  const alert = {
    id,
    message,
    type,
    dismissible,
    autoDismiss,
    timestamp: Date.now()
  };
  
  setAlerts(prev => [...prev, alert]);
  
  return id;
}

/**
 * Show an error alert
 * @param {string} message - Error message
 * @param {object} options - Additional options
 * @returns {string} Alert ID
 */
export function showError(message, options = {}) {
  return showAlert({
    message,
    type: 'danger',
    autoDismiss: 8000, // Longer duration for errors
    ...options
  });
}

/**
 * Show a success alert
 * @param {string} message - Success message
 * @param {object} options - Additional options
 * @returns {string} Alert ID
 */
export function showSuccess(message, options = {}) {
  return showAlert({
    message,
    type: 'success',
    autoDismiss: 3000, // Shorter duration for success
    ...options
  });
}

/**
 * Show a warning alert
 * @param {string} message - Warning message
 * @param {object} options - Additional options
 * @returns {string} Alert ID
 */
export function showWarning(message, options = {}) {
  return showAlert({
    message,
    type: 'warning',
    autoDismiss: 6000,
    ...options
  });
}

/**
 * Show an info alert
 * @param {string} message - Info message
 * @param {object} options - Additional options
 * @returns {string} Alert ID
 */
export function showInfo(message, options = {}) {
  return showAlert({
    message,
    type: 'info',
    autoDismiss: 4000,
    ...options
  });
}

/**
 * Clear a specific alert by ID
 * @param {string} id - Alert ID to clear
 */
export function clearAlert(id) {
  setAlerts(prev => prev.filter(alert => alert.id !== id));
}

/**
 * Clear all alerts
 */
export function clearAllAlerts() {
  setAlerts([]);
}

/**
 * Get all current alerts
 * @returns {Array} Current alerts array
 */
export function getAlerts() {
  return alerts;
}

/**
 * Handle HTTP response errors and show appropriate alerts
 * @param {Response} response - Fetch response object
 * @param {string} context - Context for the error (e.g., "sending message")
 * @returns {Promise<void>}
 */
export async function handleHttpError(response, context = "request") {
  let errorMessage = `Failed to ${context}`;
  
  try {
    // Try to get error details from response
    const errorData = await response.json();
    if (errorData.error) {
      errorMessage = errorData.error;
    } else if (errorData.message) {
      errorMessage = errorData.message;
    }
  } catch (e) {
    // If we can't parse JSON, use status-based message
    switch (response.status) {
      case 400:
        errorMessage = `Bad request while ${context}`;
        break;
      case 401:
        errorMessage = "Authentication required. Please log in.";
        break;
      case 403:
        errorMessage = "You don't have permission to perform this action.";
        break;
      case 404:
        errorMessage = `Resource not found while ${context}`;
        break;
      case 429:
        errorMessage = "Too many requests. Please try again later.";
        break;
      case 500:
        errorMessage = `Server error while ${context}. Please try again.`;
        break;
      default:
        errorMessage = `${errorMessage} (${response.status})`;
    }
  }
  
  showError(errorMessage);
}

/**
 * Handle generic errors and show appropriate alerts
 * @param {Error} error - Error object
 * @param {string} context - Context for the error
 */
export function handleError(error, context = "operation") {
  let errorMessage = `An error occurred during ${context}`;
  
  if (error.message) {
    errorMessage = error.message;
  } else if (error.toString) {
    errorMessage = error.toString();
  }
  
  showError(errorMessage);
  
  // Still log to console for debugging
  console.error(`Error during ${context}:`, error);
}

export { alerts, setAlerts };