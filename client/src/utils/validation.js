/**
 * Form validation utilities for the CRM application
 */

/**
 * Validate phone number (supports international format)
 * @param {string} phoneNumber - Phone number to validate
 * @returns {object} { isValid: boolean, error: string }
 */
export const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber || phoneNumber.trim() === '') {
    return { isValid: false, error: 'Phone number is required' };
  }

  // Remove all non-digit characters for validation
  const digits = phoneNumber.replace(/\D/g, '');

  // Check if it's a valid Indian number (91 + 10 digits)
  if (digits.startsWith('91') && digits.length === 12) {
    return { isValid: true, error: null };
  }

  // Check if it's a valid international number (10-15 digits)
  if (digits.length >= 10 && digits.length <= 15) {
    return { isValid: true, error: null };
  }

  return {
    isValid: false,
    error: 'Please enter a valid phone number (e.g., +91 98765 43210)',
  };
};

/**
 * Validate email address
 * @param {string} email - Email address to validate
 * @returns {object} { isValid: boolean, error: string }
 */
export const validateEmail = (email) => {
  if (!email || email.trim() === '') {
    return { isValid: false, error: 'Email is required' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }

  return { isValid: true, error: null };
};

/**
 * Validate agent name
 * @param {string} name - Agent name to validate
 * @returns {object} { isValid: boolean, error: string }
 */
export const validateAgentName = (name) => {
  if (!name || name.trim() === '') {
    return { isValid: false, error: 'Agent name is required' };
  }

  if (name.length < 2) {
    return { isValid: false, error: 'Agent name must be at least 2 characters' };
  }

  if (name.length > 50) {
    return { isValid: false, error: 'Agent name must not exceed 50 characters' };
  }

  return { isValid: true, error: null };
};

/**
 * Validate agent role/persona
 * @param {string} role - Agent role to validate
 * @returns {object} { isValid: boolean, error: string }
 */
export const validateAgentRole = (role) => {
  if (!role || role.trim() === '') {
    return { isValid: false, error: 'Agent role is required' };
  }

  if (role.length < 10) {
    return { isValid: false, error: 'Agent role must be at least 10 characters' };
  }

  if (role.length > 500) {
    return { isValid: false, error: 'Agent role must not exceed 500 characters' };
  }

  return { isValid: true, error: null };
};

/**
 * Validate agent instructions
 * @param {string} instructions - Agent instructions to validate
 * @returns {object} { isValid: boolean, error: string }
 */
export const validateAgentInstructions = (instructions) => {
  if (!instructions || instructions.trim() === '') {
    return { isValid: false, error: 'Agent instructions are required' };
  }

  if (instructions.length < 20) {
    return {
      isValid: false,
      error: 'Agent instructions must be at least 20 characters',
    };
  }

  if (instructions.length > 2000) {
    return {
      isValid: false,
      error: 'Agent instructions must not exceed 2000 characters',
    };
  }

  return { isValid: true, error: null };
};

/**
 * Validate required field
 * @param {any} value - Value to validate
 * @param {string} fieldName - Name of the field for error message
 * @returns {object} { isValid: boolean, error: string }
 */
export const validateRequired = (value, fieldName = 'This field') => {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, error: `${fieldName} is required` };
  }

  if (typeof value === 'string' && value.trim() === '') {
    return { isValid: false, error: `${fieldName} is required` };
  }

  return { isValid: true, error: null };
};

/**
 * Validate string length
 * @param {string} value - String to validate
 * @param {number} min - Minimum length
 * @param {number} max - Maximum length
 * @param {string} fieldName - Name of the field for error message
 * @returns {object} { isValid: boolean, error: string }
 */
export const validateLength = (
  value,
  min,
  max,
  fieldName = 'This field'
) => {
  if (!value) {
    return { isValid: false, error: `${fieldName} is required` };
  }

  const length = value.length;

  if (length < min) {
    return {
      isValid: false,
      error: `${fieldName} must be at least ${min} characters`,
    };
  }

  if (length > max) {
    return {
      isValid: false,
      error: `${fieldName} must not exceed ${max} characters`,
    };
  }

  return { isValid: true, error: null };
};

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {object} { isValid: boolean, error: string }
 */
export const validateUrl = (url) => {
  if (!url || url.trim() === '') {
    return { isValid: false, error: 'URL is required' };
  }

  try {
    new URL(url);
    return { isValid: true, error: null };
  } catch {
    return { isValid: false, error: 'Please enter a valid URL' };
  }
};

/**
 * Format validation errors for display
 * @param {object} validationResults - Object with validation results
 * @returns {object} { isValid: boolean, errors: object }
 */
export const formatValidationErrors = (validationResults) => {
  const errors = {};
  let isValid = true;

  Object.keys(validationResults).forEach((key) => {
    const result = validationResults[key];
    if (!result.isValid) {
      errors[key] = result.error;
      isValid = false;
    }
  });

  return { isValid, errors };
};
