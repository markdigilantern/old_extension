// LinkedIn Sales Navigator Content Script

// Global state and configurations
let extractedDataList = [];
let scrapedUrls = new Set();
let isPaused = false;
let isStopped = false;
let currentPage = 1;
let maxProfiles = 100;
let autoScroll = true;
let extractAccounts = true;
let extractLeads = true;
let extractionInProgress = false;
let profilesScrapedInSession = 0;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startExtraction') {
    // Start extraction with config
    const config = message.config || {};
    maxProfiles = config.maxProfiles || 100;
    autoScroll = config.autoScroll !== false;
    extractAccounts = config.extractAccounts !== false;
    extractLeads = config.extractLeads !== false;
    
    // Initialize with current scraped URLs if available
    if (config.currentScrapedUrls && Array.isArray(config.currentScrapedUrls)) {
      scrapedUrls = new Set(config.currentScrapedUrls);
    }
    
    startExtraction();
    sendResponse({ status: 'started' });
  } else if (message.action === 'pauseExtraction') {
    isPaused = true;
    sendResponse({ status: 'paused' });
  } else if (message.action === 'stopExtraction') {
    isStopped = true;
    extractionInProgress = false;
    sendResponse({ status: 'stopped' });
  }
  
  return true;
});

// Function to start data extraction
async function startExtraction() {
  // Reset state
  isPaused = false;
  isStopped = false;
  extractionInProgress = true;
  profilesScrapedInSession = 0;
  
  // Update UI in side panel
  updateProgress(0, currentPage, 'Starting extraction...');
  
  try {
    await waitForElementToLoad();
    
    // Scrape first page
    await scrapeCurrentPage();
    
    // Continue scraping until max profiles reached or stopped
    while (extractionInProgress && 
           profilesScrapedInSession < maxProfiles && 
           !isStopped) {
      
      // Check if paused
      if (isPaused) {
        updateProgress(
          Math.min(Math.round((profilesScrapedInSession / maxProfiles) * 100), 100),
          currentPage,
          'Extraction paused'
        );
        
        // Wait until unpaused
        await new Promise(resolve => {
          const checkPause = () => {
            if (!isPaused) {
              resolve();
            } else if (isStopped) {
              resolve();
            } else {
              setTimeout(checkPause, 500);
            }
          };
          checkPause();
        });
        
        if (isStopped) break;
      }
      
      // Auto-scroll to load all profiles on current page
      if (autoScroll) {
        await scrollToBottom();
      }
      
      // Try to go to next page
      const hasNextPage = await goToNextPage();
      if (!hasNextPage) {
        updateProgress(
          100,
          currentPage,
          `Extraction complete. No more pages available.`
        );
        break;
      }
      
      // Wait for the next page to load
      await waitForElementToLoad();
      
      // Scrape current page
      await scrapeCurrentPage();
    }
    
    // Extraction complete
    extractionInProgress = false;
    updateProgress(
      100,
      currentPage,
      `Extraction ${isStopped ? 'stopped' : 'complete'}. ${profilesScrapedInSession} profiles extracted.`
    );
    
    // Notify side panel that extraction is complete
    chrome.runtime.sendMessage({
      action: 'extractionComplete',
      totalScraped: profilesScrapedInSession
    });
  } catch (error) {
    console.error('Extraction error:', error);
    extractionInProgress = false;
    
    // Notify side panel of error
    chrome.runtime.sendMessage({
      action: 'extractionError',
      error: error.message
    });
  }
}

// Function to wait for search results to load
async function waitForElementToLoad() {
  return new Promise((resolve) => {
    const checkElement = () => {
      const resultsContainer = document.querySelector('#search-results-container');
      const leadResults = document.querySelectorAll('div[data-x-search-result="LEAD"]');
      const accountResults = document.querySelectorAll('div[data-x-search-result="ACCOUNT"]');
      
      if ((leadResults.length > 0 || accountResults.length > 0) && resultsContainer) {
        resolve();
      } else if (isStopped) {
        resolve();
      } else {
        setTimeout(checkElement, 500);
      }
    };
    
    checkElement();
  });
}

// Function to scroll to bottom of search results
async function scrollToBottom() {
  const container = document.querySelector('#search-results-container');
  if (!container) return false;
  
  const scrollHeight = container.scrollHeight;
  let lastPosition = container.scrollTop;
  let samePositionCount = 0;
  
  return new Promise((resolve) => {
    const scrollInterval = setInterval(() => {
      if (isPaused || isStopped) {
        clearInterval(scrollInterval);
        resolve(false);
        return;
      }
      
      // Scroll down by a step
      container.scrollTop += 300;
      
      // Check if position changed
      if (container.scrollTop === lastPosition) {
        samePositionCount++;
        
        // If position hasn't changed for several attempts, assume we're at the bottom
        if (samePositionCount >= 3) {
          clearInterval(scrollInterval);
          resolve(true);
        }
      } else {
        samePositionCount = 0;
        lastPosition = container.scrollTop;
      }
      
      // If we've reached the bottom
      if (container.scrollTop + container.clientHeight >= scrollHeight) {
        clearInterval(scrollInterval);
        resolve(true);
      }
    }, 500);
  });
}

// Function to scrape data from current page
async function scrapeCurrentPage() {
  try {
    // Scrape leads
    let newData = [];
    
    if (extractLeads) {
      const leadElements = document.querySelectorAll('div[data-x-search-result="LEAD"]');
      for (const element of leadElements) {
        if (isPaused || isStopped) break;
        
        const nameElement = element.querySelector('span[data-anonymize="person-name"]');
        const titleElement = element.querySelector('span[data-anonymize="title"]');
        const companyElement = element.querySelector('a[data-anonymize="company-name"]');
        const locationElement = element.querySelector('span[data-anonymize="location"]');
        const profileUrlElement = element.querySelector('a[data-control-name="view_lead_panel_via_search_lead_name"]');
        const connectionsElement = element.querySelector('button[data-control-name="search_spotlight_second_degree_connection"]');
        const aboutElement = element.querySelector('dd.t-12.t-black--light');

        const profileUrl = profileUrlElement?.href || 'N/A';
        if (scrapedUrls.has(profileUrl)) continue;

        const profileData = {
          type: 'Lead',
          name: nameElement?.textContent.trim() || 'N/A',
          title: titleElement?.textContent.trim() || 'N/A',
          company: companyElement?.textContent.trim() || 'N/A',
          location: locationElement?.textContent.trim() || 'N/A',
          connections: connectionsElement?.textContent.trim().replace(/\s+/g, ' ') || 'N/A',
          about: aboutElement?.textContent.trim().replace(/\s+/g, ' ') || 'N/A',
          profileUrl,
          timestamp: new Date().getTime()
        };

        if (profileData.name !== 'N/A') {
          newData.push(profileData);
          scrapedUrls.add(profileUrl);
          profilesScrapedInSession++;
        }
      }
    }
    
    // Scrape accounts
    if (extractAccounts) {
      const accountElements = document.querySelectorAll('div[data-x-search-result="ACCOUNT"]');
      for (const element of accountElements) {
        if (isPaused || isStopped) break;
        
        const nameElement = element.querySelector('a[data-anonymize="company-name"]');
        const industryElement = element.querySelector('span[data-anonymize="industry"]');
        const employeesElement = element.querySelector('a[data-anonymize="company-size"]');
        const aboutElement = element.querySelector('dd.t-12.t-black--light');
        const companyUrlElement = element.querySelector('a[data-anonymize="company-logo"]');

        const companyUrl = companyUrlElement?.href || 'N/A';
        if (scrapedUrls.has(companyUrl)) continue;

        const companyData = {
          type: 'Account',
          name: nameElement?.textContent.trim() || 'N/A',
          industry: industryElement?.textContent.trim() || 'N/A',
          employees: employeesElement?.textContent.trim() || 'N/A',
          about: aboutElement?.textContent.trim().replace(/\s+/g, ' ') || 'N/A',
          companyUrl,
          timestamp: new Date().getTime()
        };

        if (companyData.name !== 'N/A') {
          newData.push(companyData);
          scrapedUrls.add(companyUrl);
          profilesScrapedInSession++;
        }
      }
    }
    
    // Send new data to background script
    if (newData.length > 0) {
      chrome.runtime.sendMessage({
        action: 'updateExtractedData',
        newData: newData,
        newUrls: newData.map(item => item.type === 'Lead' ? item.profileUrl : item.companyUrl)
      });
    }
    
    // Update progress
    const progress = Math.min(Math.round((profilesScrapedInSession / maxProfiles) * 100), 100);
    updateProgress(
      progress,
      currentPage,
      `Extracting data (${profilesScrapedInSession}/${maxProfiles} profiles)`
    );
    
  } catch (error) {
    console.error('Error scraping current page:', error);
    throw new Error(`Error scraping page ${currentPage}: ${error.message}`);
  }
}

// Function to go to next page
async function goToNextPage() {
  try {
    const nextButton = document.querySelector('button[aria-label="Next"]');
    
    if (!nextButton || nextButton.disabled) {
      return false;
    }
    
    nextButton.click();
    currentPage++;
    
    return true;
  } catch (error) {
    console.error('Error navigating to next page:', error);
    return false;
  }
}

// Function to update progress in side panel
function updateProgress(progress, page, statusText) {
  // Add information about using side panel if needed
  const message = {
    action: 'extractionProgress',
    progress: progress,
    currentPage: page,
    statusText: statusText
  };
  
  // Get the current URL to check if we're on the right page
  const currentUrl = window.location.href;
  
  // If we're on Sales Navigator and extraction is in progress, add a hint about the side panel
  if (currentUrl.includes('linkedin.com/sales/') && extractionInProgress && progress > 0 && progress < 100) {
    console.log("LinkedIn Sales Navigator Pro extension is active - View extraction progress in the side panel");
  }
  
  chrome.runtime.sendMessage(message);
}
