// LinkedIn Data Extractor Side Panel Script

// Global state
let extractedDataList = [];
let scrapedUrls = new Set();
let isPaused = false;
let isStopped = false;
let currentPage = 1;
let currentProgress = 0;
let activeTab = 'data'; // data, extract, settings, help
let selectedItems = new Set();
let filteredData = [];
let extractionConfig = {
  maxProfiles: 100,
  autoScroll: true,
  extractAccounts: true,
  extractLeads: true
};

// Reference to CRM sync timer to prevent multiple syncs
let crmSyncTimer = null;

// DOM Elements cache
const elements = {};

// Initialize the side panel
document.addEventListener('DOMContentLoaded', () => {
  // Cache DOM elements
  cacheElements();
  
  // Initialize UI
  initializeUI();
  
  // Load data from storage
  loadDataFromStorage();
  
  // Load settings from storage
  loadSettingsFromStorage();
  
  // Add event listeners
  addEventListeners();
});

// Cache DOM elements for better performance
function cacheElements() {
  // Tabs
  elements.tabs = document.querySelectorAll('.sidebar-tab');
  elements.tabContents = document.querySelectorAll('.tab-content');
  
  // Data tab elements
  elements.dataContent = document.getElementById('data-content');
  elements.emptyState = document.getElementById('empty-state');
  elements.searchInput = document.getElementById('search-input');
  elements.filterSelect = document.getElementById('filter-select');
  elements.sortSelect = document.getElementById('sort-select');
  elements.leadCount = document.getElementById('lead-count');
  elements.accountCount = document.getElementById('account-count');
  elements.selectedCount = document.getElementById('selected-count');
  elements.selectAllBtn = document.getElementById('select-all-btn');
  elements.deselectAllBtn = document.getElementById('deselect-all-btn');
  elements.exportCsvBtn = document.getElementById('export-csv-btn');
  elements.syncCrmBtn = document.getElementById('sync-crm-btn');
  
  // Extract tab elements
  elements.totalScraped = document.getElementById('total-scraped');
  elements.currentPageEl = document.getElementById('current-page');
  elements.progressBar = document.getElementById('progress-bar');
  elements.progressText = document.getElementById('progress-text');
  elements.statusMessage = document.getElementById('status-message');
  elements.extractBtn = document.getElementById('extract-btn');
  elements.pauseBtn = document.getElementById('pause-btn');
  elements.stopBtn = document.getElementById('stop-btn');
  elements.clearBtn = document.getElementById('clear-btn');
  elements.maxProfiles = document.getElementById('max-profiles');
  elements.autoScroll = document.getElementById('auto-scroll');
  elements.extractAccounts = document.getElementById('extract-accounts');
  elements.extractLeads = document.getElementById('extract-leads');
  
  // Settings tab elements
  elements.crmEndpoint = document.getElementById('crm-endpoint');
  elements.crmApiKey = document.getElementById('crm-api-key');
  elements.saveSettings = document.getElementById('save-settings-btn');
  elements.saveData = document.getElementById('save-data');
  elements.exportAllBtn = document.getElementById('export-all-btn');
  elements.importDataBtn = document.getElementById('import-data-btn');
  elements.autoOpen = document.getElementById('auto-open');
  elements.rememberState = document.getElementById('remember-state');
  
  // Header elements
  elements.pinBtn = document.getElementById('pin-btn');
  elements.closeBtn = document.getElementById('close-btn');
}

// Initialize UI state
function initializeUI() {
  // Show active tab
  switchTab(activeTab);
  
  // Update extraction settings UI
  updateExtractionSettingsUI();
  
  // Add a notice about side panel behavior
  const statusNotice = document.createElement('div');
  statusNotice.className = 'status-message';
  statusNotice.innerHTML = `<i class="fas fa-info-circle"></i> Side panel active for LinkedIn Sales Navigator`;
  
  // Insert at the top of the panel
  const panelContent = document.querySelector('.panel-content');
  if (panelContent && panelContent.firstChild) {
    panelContent.insertBefore(statusNotice, panelContent.firstChild);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      statusNotice.style.opacity = '0';
      setTimeout(() => {
        statusNotice.remove();
      }, 500);
    }, 5000);
  }
}

// Load data from storage
function loadDataFromStorage() {
  chrome.runtime.sendMessage({ action: 'getData' }, (response) => {
    if (response && response.extractedData) {
      extractedDataList = response.extractedData;
      
      if (response.scrapedUrls) {
        scrapedUrls = new Set(response.scrapedUrls);
      }
      
      updateDataUI();
    }
  });
}

// Load settings from storage
function loadSettingsFromStorage() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
    if (response && response.settings) {
      const settings = response.settings;
      
      // Update extraction settings
      extractionConfig.maxProfiles = settings.maxProfiles || 100;
      extractionConfig.autoScroll = settings.autoScroll !== false;
      extractionConfig.extractAccounts = settings.extractAccounts !== false;
      extractionConfig.extractLeads = settings.extractLeads !== false;
      
      // Update CRM settings
      elements.crmEndpoint.value = settings.crmApiEndpoint || '';
      elements.crmApiKey.value = settings.crmApiKey || '';
      
      // Update other settings
      elements.saveData.checked = settings.saveData !== false;
      elements.autoOpen.checked = settings.autoOpen !== false;
      elements.rememberState.checked = settings.rememberState !== false;
      
      // Update settings UI
      updateExtractionSettingsUI();
    }
  });
}

// Add event listeners
function addEventListeners() {
  // Tab switching
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      switchTab(tabName);
    });
  });
  
  // Data filtering and sorting
  elements.searchInput.addEventListener('input', () => {
    updateDataUI();
  });
  
  elements.filterSelect.addEventListener('change', () => {
    updateDataUI();
  });
  
  elements.sortSelect.addEventListener('change', () => {
    updateDataUI();
  });
  
  // Data selection
  elements.selectAllBtn.addEventListener('click', selectAllItems);
  elements.deselectAllBtn.addEventListener('click', deselectAllItems);
  
  // Data export and sync
  elements.exportCsvBtn.addEventListener('click', exportSelectedAsCSV);
  elements.syncCrmBtn.addEventListener('click', syncSelectedToCRM);
  
  // Extraction controls
  elements.extractBtn.addEventListener('click', startExtraction);
  elements.pauseBtn.addEventListener('click', pauseExtraction);
  elements.stopBtn.addEventListener('click', stopExtraction);
  elements.clearBtn.addEventListener('click', clearData);
  
  // Settings updates
  elements.maxProfiles.addEventListener('change', updateExtractionSettings);
  elements.autoScroll.addEventListener('change', updateExtractionSettings);
  elements.extractAccounts.addEventListener('change', updateExtractionSettings);
  elements.extractLeads.addEventListener('change', updateExtractionSettings);
  
  // Save settings
  elements.saveSettings.addEventListener('click', saveSettings);
  
  // Data import/export
  elements.exportAllBtn.addEventListener('click', exportAllAsCSV);
  elements.importDataBtn.addEventListener('click', importData);
  
  // Panel controls
  elements.pinBtn.addEventListener('click', togglePinPanel);
  elements.closeBtn.addEventListener('click', closePanel);
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(handleMessages);
}

// Handle messages from background script or content script
function handleMessages(message, sender, sendResponse) {
  if (message.action === 'dataUpdated') {
    extractedDataList = message.data || [];
    scrapedUrls = new Set(message.urls || []);
    updateDataUI();
  } else if (message.action === 'extractionProgress') {
    updateExtractionProgress(message.progress, message.currentPage, message.statusText);
  } else if (message.action === 'extractionComplete') {
    extractionComplete(message.totalScraped);
  } else if (message.action === 'extractionError') {
    extractionError(message.error);
  }
}

// Switch between tabs
function switchTab(tabName) {
  activeTab = tabName;
  
  // Update active tab indicator
  elements.tabs.forEach(tab => {
    if (tab.getAttribute('data-tab') === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  // Show active content
  elements.tabContents.forEach(content => {
    if (content.id === `${tabName}-tab`) {
      content.classList.add('active');
      content.classList.remove('hidden');
    } else {
      content.classList.remove('active');
      content.classList.add('hidden');
    }
  });
}

// Filter and sort data based on UI controls
function filterAndSortData() {
  const searchTerm = elements.searchInput.value.toLowerCase();
  const filterType = elements.filterSelect.value;
  const sortOption = elements.sortSelect.value;
  
  // Apply filters
  filteredData = extractedDataList.filter(item => {
    // Filter by type
    if (filterType === 'leads' && item.type !== 'Lead') return false;
    if (filterType === 'accounts' && item.type !== 'Account') return false;
    
    // Filter by search term
    if (searchTerm) {
      const name = (item.name || '').toLowerCase();
      const title = (item.title || '').toLowerCase();
      const company = (item.company || '').toLowerCase();
      const industry = (item.industry || '').toLowerCase();
      
      return name.includes(searchTerm) || 
             title?.includes(searchTerm) || 
             company?.includes(searchTerm) || 
             industry?.includes(searchTerm);
    }
    
    return true;
  });
  
  // Apply sorting
  filteredData.sort((a, b) => {
    switch (sortOption) {
      case 'name-asc':
        return (a.name || '').localeCompare(b.name || '');
      case 'name-desc':
        return (b.name || '').localeCompare(a.name || '');
      case 'date-desc':
        return (b.timestamp || 0) - (a.timestamp || 0);
      case 'date-asc':
        return (a.timestamp || 0) - (b.timestamp || 0);
      default:
        return 0;
    }
  });
  
  return filteredData;
}

// Update the data UI with filtered and sorted data
function updateDataUI() {
  const filteredData = filterAndSortData();
  
  // Update counts
  const leadCount = extractedDataList.filter(item => item.type === 'Lead').length;
  const accountCount = extractedDataList.filter(item => item.type === 'Account').length;
  const selectedCount = selectedItems.size;
  
  elements.leadCount.textContent = `${leadCount} Leads`;
  elements.accountCount.textContent = `${accountCount} Accounts`;
  elements.selectedCount.textContent = `${selectedCount} Selected`;
  
  // Enable/disable buttons based on selection
  elements.exportCsvBtn.disabled = selectedCount === 0;
  elements.syncCrmBtn.disabled = selectedCount === 0;
  elements.syncCrmBtn.textContent = `Sync to CRM (${selectedCount})`;
  
  // Show empty state if no data
  if (extractedDataList.length === 0) {
    elements.emptyState.style.display = 'flex';
    elements.dataContent.innerHTML = '';
    return;
  }
  
  // Hide empty state and show data
  elements.emptyState.style.display = 'none';
  
  // Clear existing data items
  while (elements.dataContent.firstChild) {
    if (elements.dataContent.firstChild !== elements.emptyState) {
      elements.dataContent.removeChild(elements.dataContent.firstChild);
    } else {
      break;
    }
  }
  
  // Add data items
  filteredData.forEach(item => {
    const dataItem = createDataItemElement(item);
    elements.dataContent.appendChild(dataItem);
  });
  
  // Update total scraped count
  elements.totalScraped.textContent = extractedDataList.length;
}

// Create a data item element
function createDataItemElement(item) {
  const dataItem = document.createElement('div');
  dataItem.className = 'data-item';
  dataItem.dataset.id = item.type === 'Lead' ? item.profileUrl : item.companyUrl;
  
  const isChecked = selectedItems.has(dataItem.dataset.id);
  
  // Prepare the item data
  const dataHtml = `
    <div class="data-item-header">
      <div class="checkbox-container">
        <input type="checkbox" class="item-checkbox" ${isChecked ? 'checked' : ''}>
      </div>
      <div class="data-item-content">
        <div class="data-item-name">${item.name || 'N/A'}</div>
        ${item.type === 'Lead' ? 
          `<div class="data-item-title">${item.title || ''} at ${item.company || 'N/A'}</div>
           <div class="data-item-metadata">${item.location || ''} ${item.connections ? '• ' + item.connections : ''}</div>` :
          `<div class="data-item-title">${item.industry || 'N/A'}</div>
           <div class="data-item-metadata">${item.employees || ''}</div>`
        }
      </div>
      <div>
        <div class="badge">${item.type}</div>
      </div>
    </div>
  `;
  
  dataItem.innerHTML = dataHtml;
  
  // Add event listener for checkbox
  const checkbox = dataItem.querySelector('.item-checkbox');
  checkbox.addEventListener('change', () => {
    const id = dataItem.dataset.id;
    
    if (checkbox.checked) {
      selectedItems.add(id);
    } else {
      selectedItems.delete(id);
    }
    
    updateSelectedCount();
  });
  
  return dataItem;
}

// Update the selected count
function updateSelectedCount() {
  const selectedCount = selectedItems.size;
  elements.selectedCount.textContent = `${selectedCount} Selected`;
  
  // Enable/disable buttons based on selection
  elements.exportCsvBtn.disabled = selectedCount === 0;
  elements.syncCrmBtn.disabled = selectedCount === 0;
  elements.syncCrmBtn.textContent = `Sync to CRM (${selectedCount})`;
}

// Select all items
function selectAllItems() {
  filteredData.forEach(item => {
    const id = item.type === 'Lead' ? item.profileUrl : item.companyUrl;
    selectedItems.add(id);
  });
  
  // Update UI
  const checkboxes = elements.dataContent.querySelectorAll('.item-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.checked = true;
  });
  
  updateSelectedCount();
}

// Deselect all items
function deselectAllItems() {
  selectedItems.clear();
  
  // Update UI
  const checkboxes = elements.dataContent.querySelectorAll('.item-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
  });
  
  updateSelectedCount();
}

// Start the extraction process
function startExtraction() {
  // Update UI state
  elements.extractBtn.disabled = true;
  elements.pauseBtn.disabled = false;
  elements.stopBtn.disabled = false;
  elements.statusMessage.textContent = 'Starting extraction...';
  
  // Reset progress
  currentProgress = 0;
  elements.progressBar.style.width = '0%';
  elements.progressText.textContent = '0%';
  
  // Get current extraction settings
  const config = {
    maxProfiles: parseInt(elements.maxProfiles.value, 10) || 100,
    autoScroll: elements.autoScroll.checked,
    extractAccounts: elements.extractAccounts.checked,
    extractLeads: elements.extractLeads.checked,
    currentScrapedUrls: Array.from(scrapedUrls)
  };
  
  // Send message to background script to start extraction
  chrome.runtime.sendMessage({ 
    action: 'startExtraction',
    config: config
  });
  
  // Reset state
  isPaused = false;
  isStopped = false;
}

// Pause the extraction process
function pauseExtraction() {
  isPaused = true;
  
  elements.statusMessage.textContent = 'Extraction paused';
  elements.pauseBtn.disabled = true;
  elements.extractBtn.disabled = false;
  
  // Send message to background script to pause extraction
  chrome.runtime.sendMessage({ action: 'pauseExtraction' });
}

// Stop the extraction process
function stopExtraction() {
  isStopped = true;
  
  elements.statusMessage.textContent = 'Extraction stopped';
  elements.pauseBtn.disabled = true;
  elements.stopBtn.disabled = true;
  elements.extractBtn.disabled = false;
  
  // Send message to background script to stop extraction
  chrome.runtime.sendMessage({ action: 'stopExtraction' });
}

// Update extraction progress
function updateExtractionProgress(progress, page, statusText) {
  currentProgress = progress;
  currentPage = page;
  
  elements.progressBar.style.width = `${progress}%`;
  elements.progressText.textContent = `${progress}%`;
  elements.currentPageEl.textContent = page;
  elements.statusMessage.textContent = statusText || `Extracting data (${progress}% complete)`;
}

// Extraction complete
function extractionComplete(totalScraped) {
  elements.statusMessage.textContent = `Extraction complete. ${totalScraped} profiles extracted.`;
  elements.progressBar.style.width = '100%';
  elements.progressText.textContent = '100%';
  
  elements.extractBtn.disabled = false;
  elements.pauseBtn.disabled = true;
  elements.stopBtn.disabled = true;
  
  // Update data UI
  updateDataUI();
}

// Extraction error
function extractionError(error) {
  elements.statusMessage.textContent = `Error: ${error}`;
  elements.extractBtn.disabled = false;
  elements.pauseBtn.disabled = true;
  elements.stopBtn.disabled = true;
}

// Clear all extracted data
function clearData() {
  if (confirm('Are you sure you want to clear all extracted data?')) {
    extractedDataList = [];
    scrapedUrls = new Set();
    selectedItems.clear();
    
    // Reset UI
    updateDataUI();
    
    // Reset progress
    currentProgress = 0;
    elements.progressBar.style.width = '0%';
    elements.progressText.textContent = '0%';
    elements.currentPageEl.textContent = '1';
    elements.statusMessage.textContent = 'Ready to extract data';
    
    // Send message to background script to clear data
    chrome.runtime.sendMessage({ action: 'clearData' });
  }
}

// Update extraction settings from UI
function updateExtractionSettings() {
  extractionConfig.maxProfiles = parseInt(elements.maxProfiles.value, 10) || 100;
  extractionConfig.autoScroll = elements.autoScroll.checked;
  extractionConfig.extractAccounts = elements.extractAccounts.checked;
  extractionConfig.extractLeads = elements.extractLeads.checked;
}

// Update extraction settings UI from config
function updateExtractionSettingsUI() {
  elements.maxProfiles.value = extractionConfig.maxProfiles;
  elements.autoScroll.checked = extractionConfig.autoScroll;
  elements.extractAccounts.checked = extractionConfig.extractAccounts;
  elements.extractLeads.checked = extractionConfig.extractLeads;
}

// Save settings
function saveSettings() {
  // Get settings from UI
  const settings = {
    crmApiEndpoint: elements.crmEndpoint.value,
    crmApiKey: elements.crmApiKey.value,
    maxProfiles: parseInt(elements.maxProfiles.value, 10) || 100,
    autoScroll: elements.autoScroll.checked,
    extractAccounts: elements.extractAccounts.checked,
    extractLeads: elements.extractLeads.checked,
    saveData: elements.saveData.checked,
    autoOpen: elements.autoOpen.checked,
    rememberState: elements.rememberState.checked
  };
  
  // Send message to background script to save settings
  chrome.runtime.sendMessage({ 
    action: 'saveSettings',
    settings: settings
  }, (response) => {
    if (response && response.status === 'saved') {
      elements.statusMessage.textContent = 'Settings saved successfully';
      
      // Update local settings
      extractionConfig.maxProfiles = settings.maxProfiles;
      extractionConfig.autoScroll = settings.autoScroll;
      extractionConfig.extractAccounts = settings.extractAccounts;
      extractionConfig.extractLeads = settings.extractLeads;
    }
  });
}

// Export selected items as CSV
function exportSelectedAsCSV() {
  const selectedData = extractedDataList.filter(item => {
    const id = item.type === 'Lead' ? item.profileUrl : item.companyUrl;
    return selectedItems.has(id);
  });
  
  if (selectedData.length === 0) {
    alert('No items selected for export');
    return;
  }
  
  // Send message to background script to export CSV
  chrome.runtime.sendMessage({
    action: 'exportCSV',
    data: selectedData
  });
}

// Export all data as CSV
function exportAllAsCSV() {
  if (extractedDataList.length === 0) {
    alert('No data to export');
    return;
  }
  
  // Send message to background script to export CSV
  chrome.runtime.sendMessage({
    action: 'exportCSV',
    data: extractedDataList
  });
}

// Import data from file
function importData() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,.json';
  
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        let importedData = [];
        
        if (file.name.endsWith('.json')) {
          // Parse JSON file
          importedData = JSON.parse(e.target.result);
        } else if (file.name.endsWith('.csv')) {
          // Parse CSV file
          importedData = parseCSV(e.target.result);
        }
        
        if (Array.isArray(importedData) && importedData.length > 0) {
          // Confirm merge or replace
          if (extractedDataList.length > 0) {
            if (confirm(`You have ${extractedDataList.length} existing profiles. Do you want to merge with imported data? Click Cancel to replace all data.`)) {
              // Merge data
              const merged = [...extractedDataList, ...importedData];
              
              // Remove duplicates
              const uniqueData = merged.filter((item, index, self) => 
                index === self.findIndex((t) => 
                  (t.type === 'Lead' ? t.profileUrl === item.profileUrl : t.companyUrl === item.companyUrl)
                )
              );
              
              extractedDataList = uniqueData;
            } else {
              // Replace data
              extractedDataList = importedData;
            }
          } else {
            // No existing data, just import
            extractedDataList = importedData;
          }
          
          // Update scrapedUrls
          scrapedUrls = new Set(extractedDataList.map(item => 
            item.type === 'Lead' ? item.profileUrl : item.companyUrl
          ));
          
          // Save to storage
          chrome.runtime.sendMessage({ 
            action: 'saveData',
            data: extractedDataList,
            urls: Array.from(scrapedUrls)
          });
          
          // Update UI
          updateDataUI();
          
          elements.statusMessage.textContent = `Imported ${extractedDataList.length} profiles successfully`;
        } else {
          alert('No valid data found in the imported file');
        }
      } catch (error) {
        alert(`Error importing data: ${error.message}`);
      }
    };
    
    if (file.name.endsWith('.json')) {
      reader.readAsText(file);
    } else if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      alert('Unsupported file format. Please use .csv or .json files.');
    }
  });
  
  fileInput.click();
}

// Parse CSV data
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',');
  
  const result = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const obj = {};
    const currentLine = lines[i].split(',');
    
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
    
    // Add type if not specified
    if (!obj.type) {
      if (obj.profileUrl) {
        obj.type = 'Lead';
      } else if (obj.companyUrl) {
        obj.type = 'Account';
      }
    }
    
    // Add timestamp if not specified
    if (!obj.timestamp) {
      obj.timestamp = new Date().getTime();
    }
    
    result.push(obj);
  }
  
  return result;
}

// Sync selected data to CRM
function syncSelectedToCRM() {
  // Get selected data
  const selectedData = extractedDataList.filter(item => {
    const id = item.type === 'Lead' ? item.profileUrl : item.companyUrl;
    return selectedItems.has(id);
  });
  
  if (selectedData.length === 0) {
    alert('No items selected for sync');
    return;
  }
  
  // Get CRM settings
  const crmApiEndpoint = elements.crmEndpoint.value;
  const crmApiKey = elements.crmApiKey.value;
  
  if (!crmApiEndpoint) {
    alert('Please enter a CRM API endpoint in the Settings tab');
    return;
  }
  
  // Update status
  elements.statusMessage.textContent = `Syncing ${selectedData.length} profiles to CRM...`;
  elements.syncCrmBtn.disabled = true;
  elements.stopBtn.disabled = false;
  
  // Reset state
  isStopped = false;
  
  // Clear previous timer if exists
  if (crmSyncTimer) {
    clearTimeout(crmSyncTimer);
  }
  
  // Start sync
  syncDataToCRM(selectedData, crmApiEndpoint, crmApiKey);
}

// Sync data to CRM
// Define batch size for CRM sync
const BATCH_SIZE = 20;

// Helper function to convert chrome.runtime.sendMessage to Promise-based API
function sendMessagePromise(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || {});
      });
    } catch (error) {
      console.error('Send message error:', error);
      reject(error);
    }
  });
}

async function syncDataToCRM(data, endpoint, apiKey) {
  if (!endpoint) {
    elements.statusMessage.textContent = 'Error: API endpoint is required';
    elements.syncCrmBtn.disabled = false;
    return;
  }

  const totalRecords = data.length;
  let successCount = 0;
  let failedCount = 0;
  
  // Update initial status
  elements.statusMessage.textContent = `Syncing ${totalRecords} profiles to CRM in batches...`;
  elements.progressBar.style.width = '0%';
  elements.progressText.textContent = '0%';
  
  try {
    // Split data into batches
    const batches = [];
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      batches.push(data.slice(i, i + BATCH_SIZE));
    }
    
    // Process each batch
    for (let i = 0; i < batches.length; i++) {
      if (isStopped) {
        elements.statusMessage.textContent = `Sync stopped (${successCount} of ${totalRecords} synced)`;
        break;
      }
      
      const batch = batches[i];
      const batchNumber = i + 1;
      
      // Update UI for current batch
      const progress = Math.round((i / batches.length) * 100);
      elements.progressBar.style.width = `${progress}%`;
      elements.progressText.textContent = `${progress}%`;
      elements.statusMessage.textContent = `Processing batch ${batchNumber}/${batches.length} (${batch.length} profiles)...`;
      
      try {
        console.log(`Sending batch ${batchNumber}/${batches.length} to: ${endpoint}`);
        console.log('Batch data sample:', batch.slice(0, 1));
        
        // Send request through background script to avoid CORS issues
        const result = await sendMessagePromise({
          action: 'syncToCRM',
          data: batch,
          endpoint: endpoint,
          apiKey: apiKey
        });
        
        if (result.error) {
          throw new Error(result.error);
        }
        
        // Log success
        console.log(`Successfully sent batch ${batchNumber}/${batches.length}`, result);
        
        // Count successful records
        successCount += batch.length;
        
        // Add small delay between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`Error in batch ${batchNumber}:`, error);
        console.error('Request details:', { 
          endpoint, 
          batchSize: batch.length, 
          hasApiKey: !!apiKey
        });
        failedCount += batch.length;
        
        // Continue with next batch instead of stopping completely
        elements.statusMessage.textContent = `Error in batch ${batchNumber}: ${error.message}. Continuing...`;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Update final status
    const finalProgress = isStopped ? Math.round((successCount / totalRecords) * 100) : 100;
    elements.progressBar.style.width = `${finalProgress}%`;
    elements.progressText.textContent = `${finalProgress}%`;
    
    if (failedCount > 0) {
      elements.statusMessage.textContent = `Sync complete: ${successCount} profiles synced, ${failedCount} failed`;
    } else {
      elements.statusMessage.textContent = `Successfully synced ${successCount} profiles to CRM`;
    }
    
  } catch (error) {
    // Handle overall error
    elements.statusMessage.textContent = `Error syncing to CRM: ${error.message}`;
    console.error('CRM sync error:', error);
  }
  
  // Enable button after delay
  crmSyncTimer = setTimeout(() => {
    elements.syncCrmBtn.disabled = false;
    elements.stopBtn.disabled = true;
  }, 3000);
}

// Toggle pin panel state
function togglePinPanel() {
  const pinned = elements.pinBtn.classList.toggle('active');
  
  if (chrome.sidePanel && chrome.sidePanel.setPinnedState) {
    chrome.sidePanel.setPinnedState({ pinned });
  }
}

// Close the panel
function closePanel() {
  // Add a notice about how to reopen the panel
  const statusNotice = document.createElement('div');
  statusNotice.className = 'status-message';
  statusNotice.innerHTML = `<i class="fas fa-info-circle"></i> To reopen the side panel, click the extension icon in your browser toolbar.`;
  
  // Insert at the top of the panel
  const panelContent = document.querySelector('.panel-content');
  if (panelContent && panelContent.firstChild) {
    panelContent.insertBefore(statusNotice, panelContent.firstChild);
    
    // Close after a short delay to allow message to be seen
    setTimeout(() => {
      if (chrome.sidePanel && chrome.sidePanel.close) {
        chrome.sidePanel.close();
      }
    }, 2000);
  } else {
    // Close immediately if we couldn't show the message
    if (chrome.sidePanel && chrome.sidePanel.close) {
      chrome.sidePanel.close();
    }
  }
}
