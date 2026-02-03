// Initialize storage
let extractedProfiles = new Set();

// Initialize the extension when popup opens
function init() {
  loadProfiles();
  setupEventListeners();
}

// Load profiles from Chrome storage
function loadProfiles() {
  chrome.storage.local.get(['linkedinProfiles'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading profiles:', chrome.runtime.lastError);
      return;
    }
    
    if (result.linkedinProfiles && Array.isArray(result.linkedinProfiles)) {
      extractedProfiles = new Set(result.linkedinProfiles);
      updateDisplay();
    }
  });
}

// Save profiles to Chrome storage
function saveProfiles() {
  const profilesArray = Array.from(extractedProfiles);
  chrome.storage.local.set({ linkedinProfiles: profilesArray }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error saving profiles:', chrome.runtime.lastError);
    }
  });
}

// Setup all event listeners
function setupEventListeners() {
  document.getElementById('extractBtn').addEventListener('click', handleExtract);
  document.getElementById('exportBtn').addEventListener('click', handleExport);
  document.getElementById('clearBtn').addEventListener('click', handleClear);
}

// Handle profile extraction
async function handleExtract() {
  const extractBtn = document.getElementById('extractBtn');
  const statusDiv = document.getElementById('status');
  
  // Disable button and show loading
  extractBtn.disabled = true;
  extractBtn.textContent = 'Extracting...';
  setStatus('Extracting profiles from page...', 'info');
  
  try {
    // Get active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Verify we're on LinkedIn
    if (!activeTab.url || !activeTab.url.includes('linkedin.com')) {
      throw new Error('Please navigate to LinkedIn search results page');
    }
    
    // Execute extraction script
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: extractProfilesFromPage,
    });
    
    if (!results || !results[0] || !results[0].result) {
      throw new Error('Failed to extract profiles');
    }
    
    const foundProfiles = results[0].result;
    
    if (foundProfiles.length === 0) {
      setStatus('No profiles found on this page', 'error');
      return;
    }
    
    // Add profiles and track new ones
    const beforeCount = extractedProfiles.size;
    foundProfiles.forEach(profile => extractedProfiles.add(profile));
    const newCount = extractedProfiles.size - beforeCount;
    
    // Save and update UI
    saveProfiles();
    updateDisplay();
    
    setStatus(`Found ${foundProfiles.length} profiles (${newCount} new, ${foundProfiles.length - newCount} duplicates)`, 'success');
    
  } catch (error) {
    console.error('Extraction error:', error);
    setStatus(`Error: ${error.message}`, 'error');
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = 'Extract Profiles from Current Page';
  }
}

// Handle CSV export
function handleExport() {
  if (extractedProfiles.size === 0) {
    setStatus('No profiles to export', 'error');
    return;
  }
  
  try {
    // Create CSV content
    const csvRows = ['Profile URL'];
    extractedProfiles.forEach(profile => {
      csvRows.push(profile);
    });
    const csvContent = csvRows.join('\n');
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `linkedin_profiles_${timestamp}.csv`;
    
    // Trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setStatus(`Exported ${extractedProfiles.size} profiles to ${filename}`, 'success');
  } catch (error) {
    console.error('Export error:', error);
    setStatus(`Export failed: ${error.message}`, 'error');
  }
}

// Handle clear all
function handleClear() {
  if (extractedProfiles.size === 0) {
    setStatus('No profiles to clear', 'info');
    return;
  }
  
  const confirmMsg = `Are you sure you want to clear all ${extractedProfiles.size} profiles?`;
  if (confirm(confirmMsg)) {
    extractedProfiles.clear();
    chrome.storage.local.remove('linkedinProfiles', () => {
      if (chrome.runtime.lastError) {
        console.error('Error clearing storage:', chrome.runtime.lastError);
      }
    });
    updateDisplay();
    setStatus('All profiles cleared', 'info');
  }
}

// Update status message
function setStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
}

// Update the display
function updateDisplay() {
  const profilesSection = document.getElementById('profilesSection');
  const profilesList = document.getElementById('profilesList');
  const countDiv = document.getElementById('count');
  
  if (extractedProfiles.size > 0) {
    profilesSection.classList.remove('hidden');
    countDiv.textContent = `Total Profiles: ${extractedProfiles.size}`;
    
    // Clear and rebuild list
    profilesList.innerHTML = '';
    
    const profilesArray = Array.from(extractedProfiles).sort();
    profilesArray.forEach((profile, index) => {
      const item = document.createElement('div');
      item.className = 'profile-item';
      item.textContent = `${index + 1}. ${profile}`;
      profilesList.appendChild(item);
    });
  } else {
    profilesSection.classList.add('hidden');
  }
}

// Function injected into page to extract profiles
function extractProfilesFromPage() {
  const profileSet = new Set();
  
  // Find all anchor tags with href containing /in/
  const allLinks = document.querySelectorAll('a[href*="/in/"]');
  
  allLinks.forEach(link => {
    try {
      const href = link.getAttribute('href');
      if (!href) return;
      
      // Extract username from various LinkedIn profile URL formats
      const patterns = [
        /linkedin\.com\/in\/([^/?#]+)/,
        /\/in\/([^/?#]+)/
      ];
      
      for (const pattern of patterns) {
        const match = href.match(pattern);
        if (match && match[1]) {
          const username = match[1];
          // Construct clean URL
          const cleanUrl = `https://www.linkedin.com/in/${username}`;
          profileSet.add(cleanUrl);
          break;
        }
      }
    } catch (error) {
      console.error('Error processing link:', error);
    }
  });
  
  return Array.from(profileSet);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
