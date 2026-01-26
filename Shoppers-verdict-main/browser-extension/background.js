// Background service worker for Shopper's Verdict extension

chrome.runtime.onInstalled.addListener(() => {
    console.log('Shopper\'s Verdict extension installed');
    
    // Set up initial storage with error handling
    try {
        chrome.storage.local.set({
            extensionEnabled: true,
            apiBaseUrl: 'http://localhost:5000'
        });
    } catch (storageError) {
        console.warn('Initial storage setup failed:', storageError);
    }
});

// Handle tab updates to detect navigation to product pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        try {
            // Check if it's a supported product page
            const supportedPatterns = [
                /amazon\.(in|com).*\/dp\/[A-Z0-9]{10}/,
                /amazon\.(in|com).*\/gp\/product\/[A-Z0-9]{10}/,
                /amazon\.(in|com).*\/product\/[A-Z0-9]{10}/,
                /flipkart\.com.*\/p\/[a-zA-Z0-9\-]+/
            ];
            
            const isProductPage = supportedPatterns.some(pattern => pattern.test(tab.url));
            console.log('Background: Checking URL:', tab.url, 'Is product page:', isProductPage);
            
            if (isProductPage) {
                // Update badge to indicate product page detected
                chrome.action.setBadgeText({
                    tabId: tabId,
                    text: '!'
                }).catch(err => console.warn('Badge text error:', err));
                
                chrome.action.setBadgeBackgroundColor({
                    tabId: tabId,
                    color: '#667eea'
                }).catch(err => console.warn('Badge color error:', err));
                
                chrome.action.setTitle({
                    tabId: tabId,
                    title: 'Shopper\'s Verdict - Click to analyze this product'
                }).catch(err => console.warn('Title error:', err));
            } else {
                // Clear badge for non-product pages
                chrome.action.setBadgeText({
                    tabId: tabId,
                    text: ''
                }).catch(err => console.warn('Badge clear error:', err));
                
                chrome.action.setTitle({
                    tabId: tabId,
                    title: 'Shopper\'s Verdict - Navigate to Amazon/Flipkart product page'
                }).catch(err => console.warn('Title clear error:', err));
            }
        } catch (error) {
            console.warn('Tab update handler error:', error);
        }
    }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // This will trigger the popup to open
    // No additional action needed as popup is defined in manifest
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzeProduct') {
        // Forward to content script
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, request);
            }
        });
        sendResponse({success: true});
    } else if (request.action === 'openFullReport') {
        chrome.tabs.create({
            url: request.url
        });
        sendResponse({success: true});
    } else if (request.action === 'getSettings') {
        chrome.storage.local.get(['extensionEnabled', 'apiBaseUrl'], (result) => {
            sendResponse(result);
        });
        return true; // Keep message channel open for async response
    } else if (request.action === 'updateSettings') {
        chrome.storage.local.set(request.settings, () => {
            sendResponse({success: true});
        });
        return true;
    }
});

// Handle context menu (optional enhancement)
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'analyzeProduct',
        title: 'Analyze with Shopper\'s Verdict',
        contexts: ['page'],
        documentUrlPatterns: [
            '*://www.amazon.in/*',
            '*://amazon.in/*',
            '*://www.amazon.com/*',
            '*://amazon.com/*',
            '*://www.flipkart.com/*',
            '*://flipkart.com/*'
        ]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'analyzeProduct') {
        // Send message to content script to start analysis
        chrome.tabs.sendMessage(tab.id, {
            action: 'analyzeProduct'
        });
    }
});

// Cleanup old cache data periodically
setInterval(() => {
    chrome.storage.local.get(null, (items) => {
        const now = Date.now();
        const itemsToRemove = [];
        
        for (const [key, value] of Object.entries(items)) {
            if (key.startsWith('analysis_') && value.timestamp) {
                const age = now - value.timestamp;
                const maxAge = 24 * 60 * 60 * 1000; // 24 hours
                
                if (age > maxAge) {
                    itemsToRemove.push(key);
                }
            }
        }
        
        if (itemsToRemove.length > 0) {
            chrome.storage.local.remove(itemsToRemove);
        }
    });
}, 60 * 60 * 1000); // Run every hour