// Background service worker for Shopper's Verdict extension

const STORAGE_KEYS = {
    ENABLED: 'extensionEnabled',
    API_BASE_URL: 'apiBaseUrl',
    ANALYSIS_HISTORY: 'analysisHistory',
    BOOKMARKS: 'bookmarkedProducts',
    SETTINGS: 'userSettings'
};

const MAX_HISTORY_ITEMS = 50;

chrome.runtime.onInstalled.addListener(() => {
    console.log('Shopper\'s Verdict extension installed (v2.0)');
    
    // Initialize storage with defaults
    try {
        chrome.storage.local.set({
            [STORAGE_KEYS.ENABLED]: true,
            [STORAGE_KEYS.API_BASE_URL]: 'http://localhost:5000',
            [STORAGE_KEYS.ANALYSIS_HISTORY]: [],
            [STORAGE_KEYS.BOOKMARKS]: [],
            [STORAGE_KEYS.SETTINGS]: {
                notificationsEnabled: true,
                autoAnalyze: false,
                historyEnabled: true
            }
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
                    text: '✓'
                }).catch(err => console.warn('Badge text error:', err));
                
                chrome.action.setBadgeBackgroundColor({
                    tabId: tabId,
                    color: '#667eea'
                }).catch(err => console.warn('Badge color error:', err));
                
                chrome.action.setTitle({
                    tabId: tabId,
                    title: 'Shopper\'s Verdict - Click to analyze (Alt+Shift+V)'
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

// Handle keyboard command
chrome.commands.onCommand.addListener((command) => {
    if (command === 'analyze-product') {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                // Open popup or send message to trigger analysis
                chrome.tabs.sendMessage(tabs[0].id, {action: 'triggerAnalysis'}).catch(() => {
                    // If content script not loaded, open popup
                    chrome.action.openPopup();
                });
            }
        });
    }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // Popup will open automatically when manifest defines it
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveToHistory') {
        saveAnalysisToHistory(request.data, sendResponse);
        return true;
    } else if (request.action === 'getHistory') {
        chrome.storage.local.get([STORAGE_KEYS.ANALYSIS_HISTORY], (result) => {
            sendResponse(result[STORAGE_KEYS.ANALYSIS_HISTORY] || []);
        });
        return true;
    } else if (request.action === 'bookmarkProduct') {
        bookmarkProduct(request.data, sendResponse);
        return true;
    } else if (request.action === 'removeBookmark') {
        removeBookmark(request.url, sendResponse);
        return true;
    } else if (request.action === 'getBookmarks') {
        chrome.storage.local.get([STORAGE_KEYS.BOOKMARKS], (result) => {
            sendResponse(result[STORAGE_KEYS.BOOKMARKS] || []);
        });
        return true;
    } else if (request.action === 'analyzeProduct') {
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
        chrome.storage.local.get(Object.values(STORAGE_KEYS), (result) => {
            sendResponse(result);
        });
        return true;
    } else if (request.action === 'updateSettings') {
        chrome.storage.local.set(request.settings, () => {
            sendResponse({success: true});
        });
        return true;
    } else if (request.action === 'showNotification') {
        chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (result) => {
            const settings = result[STORAGE_KEYS.SETTINGS] || {};
            if (settings.notificationsEnabled) {
                // Send message to content script to show notification
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'showNotification',
                            message: request.message,
                            type: request.type
                        });
                    }
                });
            }
        });
        sendResponse({success: true});
    }
});

// Helper functions
function saveAnalysisToHistory(analysisData, callback) {
    chrome.storage.local.get([STORAGE_KEYS.ANALYSIS_HISTORY], (result) => {
        let history = result[STORAGE_KEYS.ANALYSIS_HISTORY] || [];
        
        // Add new analysis
        const newAnalysis = {
            ...analysisData,
            timestamp: Date.now(),
            id: `analysis_${Date.now()}`
        };
        
        history.unshift(newAnalysis);
        
        // Keep only recent items
        if (history.length > MAX_HISTORY_ITEMS) {
            history = history.slice(0, MAX_HISTORY_ITEMS);
        }
        
        chrome.storage.local.set({[STORAGE_KEYS.ANALYSIS_HISTORY]: history}, () => {
            callback({success: true, id: newAnalysis.id});
        });
    });
}

function bookmarkProduct(productData, callback) {
    chrome.storage.local.get([STORAGE_KEYS.BOOKMARKS], (result) => {
        let bookmarks = result[STORAGE_KEYS.BOOKMARKS] || [];
        
        // Check if already bookmarked
        const exists = bookmarks.some(b => b.url === productData.url);
        if (!exists) {
            bookmarks.unshift({
                ...productData,
                bookmarkedAt: Date.now()
            });
            
            chrome.storage.local.set({[STORAGE_KEYS.BOOKMARKS]: bookmarks}, () => {
                callback({success: true, message: 'Product bookmarked'});
            });
        } else {
            callback({success: false, message: 'Already bookmarked'});
        }
    });
}

function removeBookmark(url, callback) {
    chrome.storage.local.get([STORAGE_KEYS.BOOKMARKS], (result) => {
        let bookmarks = result[STORAGE_KEYS.BOOKMARKS] || [];
        bookmarks = bookmarks.filter(b => b.url !== url);
        
        chrome.storage.local.set({[STORAGE_KEYS.BOOKMARKS]: bookmarks}, () => {
            callback({success: true, message: 'Bookmark removed'});
        });
    });
}

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