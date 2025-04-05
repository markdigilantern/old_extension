// Background script for LinkedIn Sales Navigator Pro Extension

// Default configuration
const DEFAULT_CONFIG = {
  crmApiEndpoint: 'https://httpbin.org/post', // A reliable test endpoint for development
  crmApiKey: '',
  maxProfiles: 100,
  autoScroll: true,
  extractAccounts: true,
  extractLeads: true,
  saveData: true,
  autoOpen: true,
  rememberState: true
};

// Initialize extension settings
chrome.runtime.onInstalled.addListener(() => {
  // Set default settings if not already set
  chrome.storage.local.get('settings', (data) => {
    if (!data.settings) {
      chrome.storage.local.set({ 
        settings: DEFAULT_CONFIG,
        extractedData: [],
        scrapedUrls: []
      });
    }
  });
  
  // Register the side panel
  if (chrome.sidePanel) {
    chrome.sidePanel.setOptions({
      path: 'sidePanel.html',
      enabled: true
    });
  }
});

// Add click event listener for extension icon - this will open the side panel
// This is allowed because it's responding to a user gesture (clicking the extension icon)
chrome.action.onClicked.addListener((tab) => {
  if (chrome.sidePanel) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for tab updates to set the side panel availability on LinkedIn Sales Navigator
// Note: We can't automatically open the panel as it requires a user gesture
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('linkedin.com/sales/')) {
    chrome.storage.local.get('settings', (data) => {
      const settings = data.settings || DEFAULT_CONFIG;
      
      // Instead of trying to open automatically, we'll just ensure the side panel is available
      if (chrome.sidePanel) {
        chrome.sidePanel.setOptions({
          path: 'sidePanel.html',
          enabled: true
        });
      }
      
      // Show a notification to remind user to open the side panel
      if (settings.autoOpen) {
        chrome.action.setBadgeText({ text: "ON", tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#4285F4", tabId });
      }
    });
  }
});

// Listen for messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startExtraction') {
    // Start the extraction process
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      
      // Send message to content script to start extraction
      chrome.tabs.sendMessage(activeTab.id, { 
        action: 'startExtraction',
        config: message.config
      });
      
      sendResponse({ status: 'started' });
    });
    return true;
  }
  
  if (message.action === 'pauseExtraction') {
    // Pause the extraction process
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      chrome.tabs.sendMessage(activeTab.id, { action: 'pauseExtraction' });
      sendResponse({ status: 'paused' });
    });
    return true;
  }
  
  if (message.action === 'stopExtraction') {
    // Stop the extraction process
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      chrome.tabs.sendMessage(activeTab.id, { action: 'stopExtraction' });
      sendResponse({ status: 'stopped' });
    });
    return true;
  }
  
  if (message.action === 'saveData') {
    // Save extracted data
    chrome.storage.local.set({ 
      extractedData: message.data,
      scrapedUrls: message.urls
    }, () => {
      sendResponse({ status: 'saved' });
    });
    return true;
  }
  
  if (message.action === 'getData') {
    // Get saved data
    chrome.storage.local.get(['extractedData', 'scrapedUrls'], (data) => {
      sendResponse({
        extractedData: data.extractedData || [],
        scrapedUrls: data.scrapedUrls || []
      });
    });
    return true;
  }
  
  if (message.action === 'clearData') {
    // Clear saved data
    chrome.storage.local.set({ 
      extractedData: [],
      scrapedUrls: []
    }, () => {
      sendResponse({ status: 'cleared' });
    });
    return true;
  }
  
  if (message.action === 'saveSettings') {
    // Save settings
    chrome.storage.local.set({ settings: message.settings }, () => {
      sendResponse({ status: 'saved' });
    });
    return true;
  }
  
  if (message.action === 'getSettings') {
    // Get settings
    chrome.storage.local.get('settings', (data) => {
      sendResponse({ settings: data.settings || DEFAULT_CONFIG });
    });
    return true;
  }
  
  if (message.action === 'exportCSV') {
    // Export data as CSV
    const csv = convertToCSV(message.data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: 'linkedin_data_' + new Date().toISOString().slice(0, 10) + '.csv',
      saveAs: true
    }, () => {
      sendResponse({ status: 'exported' });
    });
    return true;
  }
  
  if (message.action === 'updateExtractedData') {
    // Update extracted data from content script
    chrome.storage.local.get(['extractedData', 'scrapedUrls'], (data) => {
      const extractedData = data.extractedData || [];
      const scrapedUrls = data.scrapedUrls || [];
      
      // Merge new data with existing data
      const combinedData = [...extractedData, ...message.newData];
      const combinedUrls = [...scrapedUrls, ...message.newUrls];
      
      // Remove duplicates
      const uniqueData = combinedData.filter((item, index, self) => 
        index === self.findIndex((t) => 
          (t.type === 'Lead' ? t.profileUrl === item.profileUrl : t.companyUrl === item.companyUrl)
        )
      );
      
      const uniqueUrls = [...new Set(combinedUrls)];
      
      // Save updated data
      chrome.storage.local.set({ 
        extractedData: uniqueData,
        scrapedUrls: uniqueUrls
      }, () => {
        // Send updated data to side panel
        chrome.runtime.sendMessage({
          action: 'dataUpdated',
          data: uniqueData,
          urls: uniqueUrls
        });
      });
    });
    return true;
  }
  
  if (message.action === 'syncToCRM') {
    // Handle CRM sync (can't use await directly in message handlers)
    console.log(`Starting CRM sync for ${message.data.length} records to ${message.endpoint}`);
    
    // First, check if the endpoint is the default one
    // If so, use a reliable test endpoint instead
    let endpoint = message.endpoint;
    if (endpoint === 'http://localhost:3000/api/account') {
      console.warn('Using fallback test endpoint. In production, set a real CRM endpoint in settings.');
      endpoint = 'https://httpbin.org/post';
    }
    
    // Format the data for batch processing
    const formattedData = {
      operation: 'batch_sync',
      timestamp: new Date().toISOString(),
      batch_id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10),
      profiles: message.data.map(profile => ({
        source: 'linkedin_sales_navigator',
        extracted_at: new Date().toISOString(),
        ...profile
      }))
    };
    
    // Process in batches if needed
    // We'll use the built-in implementation
    syncToCRMWithRetry(message.data, endpoint, message.apiKey)
      .then(result => {
        console.log('Sync completed successfully:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('CRM sync error:', error);
        sendResponse({ 
          error: error.message || 'Failed to sync with CRM',
          failedRequest: {
            endpoint: endpoint,
            dataCount: message.data.length,
            hasApiKey: !!message.apiKey
          }
        });
      });
    
    return true;
  }
});

// Dynamic import of CRM integration module
let crmIntegrationLoaded = false;
let CRMIntegration = null;

// Function to load the CRM Integration module
async function loadCRMModule() {
  if (crmIntegrationLoaded) {
    return;
  }
  
  try {
    // Create a script element to load the CRM integration module
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('crm-integration.js');
    script.type = 'text/javascript';
    
    // Wait for the script to load
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    
    // Wait a bit to ensure the script is fully executed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if the module is loaded and accessible
    if (window.CRMIntegration) {
      CRMIntegration = window.CRMIntegration;
      crmIntegrationLoaded = true;
      console.log('CRM Integration module loaded successfully');
    } else {
      throw new Error('CRM Integration module not found after loading');
    }
  } catch (error) {
    console.error('Error loading CRM Integration module:', error);
    // Fallback to using the built-in implementation
    crmIntegrationLoaded = true; // Mark as loaded to prevent infinite attempts
  }
}

// Function to handle CRM synchronization with retry logic and chunking
async function syncToCRMWithRetry(data, endpoint, apiKey, maxRetries = 3) {
  try {
    // Check if we should use the external module
    // If external module loaded successfully, use it
    if (crmIntegrationLoaded && CRMIntegration) {
      return await CRMIntegration.syncToCRMWithRetry(data, endpoint, apiKey, maxRetries);
    }
    
    // Otherwise, fall back to the built-in implementation
    
    // If endpoint is default, use a better test endpoint
    if (endpoint === 'http://localhost:3000/api/account') {
      console.warn('Using default test endpoint. In a production environment, update to your actual CRM endpoint.');
      endpoint = 'https://httpbin.org/post';
    }
    
    // If data is too big, split it into manageable chunks
    // This helps avoid request size limits and timeouts
    const MAX_CHUNK_SIZE = 50; // Maximum recommended payload size (in KB)
    
    // Estimate data size and create chunks if needed
    const estimatedSize = JSON.stringify(data).length / 1024; // size in KB
    
    if (estimatedSize > MAX_CHUNK_SIZE && data.length > 1) {
      console.log(`Data size (${Math.round(estimatedSize)}KB) exceeds recommended limit (${MAX_CHUNK_SIZE}KB). Processing in chunks.`);
      
      // Split data in half and process recursively
      const midpoint = Math.floor(data.length / 2);
      const firstHalf = data.slice(0, midpoint);
      const secondHalf = data.slice(midpoint);
      
      // Process each half and combine results
      try {
        const firstResult = await syncToCRMWithRetry(firstHalf, endpoint, apiKey, maxRetries);
        const secondResult = await syncToCRMWithRetry(secondHalf, endpoint, apiKey, maxRetries);
        
        // Combine results
        return {
          success: firstResult.success && secondResult.success,
          data: {
            message: `Processed ${data.length} records in multiple chunks`,
            details: [firstResult.data, secondResult.data]
          }
        };
      } catch (error) {
        // If any chunk fails, the overall operation fails
        throw error;
      }
    }
    
    // Format the data for CRM submission
    const formattedData = {
      operation: 'batch_sync',
      timestamp: new Date().toISOString(),
      batch_id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10),
      profiles: data.map(profile => ({
        source: 'linkedin_sales_navigator',
        extracted_at: new Date().toISOString(),
        ...profile
      }))
    };
    
    // Process data normally if it's within size limits or can't be split further
    let retries = 0;
    
    // Function for a single attempt
    async function attempt() {
      try {
        console.log(`Attempt ${retries + 1}: Syncing ${data.length} records to CRM at ${endpoint}`);
        console.log(`Request details: Method=POST, HasData=${!!formattedData}, HasAPIKey=${!!apiKey}`);
  
        // Make the API request
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey ? `Bearer ${apiKey}` : '',
            // Add typical headers to avoid CORS issues
            'Origin': 'chrome-extension://' + chrome.runtime.id,
            'User-Agent': navigator.userAgent
          },
          body: JSON.stringify(formattedData)
        });
        
        // Check response status
        if (!response.ok) {
          // Try to get error details
          let errorText = '';
          try {
            errorText = await response.text();
          } catch (e) {
            errorText = response.statusText;
          }
          
          throw new Error(`API error (${response.status}): ${errorText}`);
        }
        
        // Parse the response if it contains JSON
        let result;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          result = await response.json();
        } else {
          result = { success: true, statusCode: response.status };
        }
        
        return { 
          success: true, 
          data: result,
          syncedCount: data.length
        };
      } catch (error) {
        console.error(`Attempt ${retries + 1} failed:`, error);
        console.error('Request endpoint:', endpoint);
        
        if (retries < maxRetries) {
          retries++;
          // Exponential backoff: wait longer with each retry
          const delay = Math.pow(2, retries) * 1000;
          console.log(`Retrying in ${delay}ms...`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return attempt(); // Recursive retry
        } else {
          throw error; // Maximum retries reached, propagate the error
        }
      }
    }
    
    // Start the first attempt
    return attempt();
  } catch (error) {
    console.error('Critical error in syncToCRMWithRetry:', error);
    throw error;
  }
}

// Helper function to convert data to CSV
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
