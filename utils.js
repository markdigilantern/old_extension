// Utility functions for LinkedIn Sales Navigator Pro Extension

/**
 * Wait for an element to appear in the DOM
 * @param {string} selector - CSS selector for the element
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @returns {Promise<Element|null>} - The element or null if timeout
 */
function waitForElement(selector, timeout = 20000) {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    const observer = new MutationObserver(() => {
      const targetElement = document.querySelector(selector);
      if (targetElement) {
        resolve(targetElement);
        observer.disconnect();
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * Convert data to CSV format
 * @param {Array} data - Array of objects to convert
 * @returns {string} - CSV formatted string
 */
function convertToCSV(data) {
  if (!data || data.length === 0) {
    return '';
  }
  
  // Determine all possible headers from all objects
  const allHeaders = new Set();
  data.forEach(item => {
    Object.keys(item).forEach(key => {
      if (key !== 'selected') {
        allHeaders.add(key);
      }
    });
  });
  
  const headers = Array.from(allHeaders);
  
  // Create CSV header row
  let csv = headers.join(',') + '\n';
  
  // Add data rows
  data.forEach(item => {
    const row = headers.map(header => {
      const value = item[header] !== undefined ? item[header] : '';
      
      // Escape commas, quotes, and new lines
      const escaped = ('' + value).replace(/"/g, '""');
      
      // Wrap in quotes if the value contains commas, quotes, or new lines
      return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
    });
    
    csv += row.join(',') + '\n';
  });
  
  return csv;
}

/**
 * Format date object to string
 * @param {Date} date - Date object
 * @param {string} format - Format string
 * @returns {string} - Formatted date string
 */
function formatDate(date, format = 'yyyy-MM-dd HH:mm:ss') {
  if (!date) return '';
  
  // Convert timestamp to date if needed
  const d = typeof date === 'number' ? new Date(date) : date;
  
  const values = {
    yyyy: d.getFullYear(),
    MM: String(d.getMonth() + 1).padStart(2, '0'),
    dd: String(d.getDate()).padStart(2, '0'),
    HH: String(d.getHours()).padStart(2, '0'),
    mm: String(d.getMinutes()).padStart(2, '0'),
    ss: String(d.getSeconds()).padStart(2, '0')
  };
  
  return format.replace(/yyyy|MM|dd|HH|mm|ss/g, match => values[match]);
}

/**
 * Debounce function to limit how often a function is called
 * @param {Function} func - Function to debounce
 * @param {number} wait - Time to wait in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait = 300) {
  let timeout;
  
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Get URL parameters as an object
 * @param {string} url - URL to extract parameters from
 * @returns {Object} - Parameter key-value pairs
 */
function getUrlParameters(url) {
  const params = {};
  const urlString = url || window.location.href;
  const urlParams = new URL(urlString).searchParams;
  
  for (const [key, value] of urlParams.entries()) {
    params[key] = value;
  }
  
  return params;
}

/**
 * Parse CSV data to an array of objects
 * @param {string} csvText - CSV text to parse
 * @returns {Array} - Array of objects
 */
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',');
  
  const result = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const obj = {};
    const currentLine = parseCsvLine(lines[i]);
    
    for (let j = 0; j < headers.length; j++) {
      let value = currentLine[j] || '';
      
      // Remove quotes if they exist
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      
      // Replace double quotes with single quotes
      value = value.replace(/""/g, '"');
      
      obj[headers[j]] = value;
    }
    
    result.push(obj);
  }
  
  return result;
}

/**
 * Parse a CSV line respecting quoted values with commas
 * @param {string} line - CSV line to parse
 * @returns {Array} - Array of values
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      // Toggle quote state
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      // Add character to current field
      current += char;
    }
  }
  
  // Add the last field
  result.push(current);
  
  return result;
}

/**
 * Generate a unique ID
 * @returns {string} - Unique ID
 */
function generateUniqueId() {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Format number with thousand separators
 * @param {number} num - Number to format
 * @returns {string} - Formatted number
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Truncate text to specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} length - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, length = 100) {
  if (!text || text.length <= length) return text;
  return text.substring(0, length) + '...';
}
