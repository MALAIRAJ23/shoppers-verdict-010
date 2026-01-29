// Shopper's Verdict Browser Extension - Popup Script (v2.0)

const API_BASE_URL = 'http://localhost:5000';
const SUPPORTED_SITES = ['amazon.in', 'amazon.com', 'flipkart.com'];
const API_TIMEOUT = 30000; // 30 seconds

// DOM Elements
const loadingEl = document.getElementById('loading');
const contentEl = document.getElementById('content');
const errorEl = document.getElementById('error');
const notProductPageEl = document.getElementById('notProductPage');

// Initialize popup
document.addEventListener('DOMContentLoaded', function() {
    initializePopup();
});

async function initializePopup() {
    try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url) {
            showError('Unable to access current page');
            return;
        }

        const url = tab.url;
        console.log('Current URL:', url);

        // Check if we're on a supported site
        if (!isSupportedSite(url)) {
            showNotProductPage();
            return;
        }

        // Check if it's a product page
        if (!isProductPage(url)) {
            showNotProductPage();
            return;
        }

        // Start analysis
        await analyzeProduct(url);

    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize extension');
    }
}

function isSupportedSite(url) {
    return SUPPORTED_SITES.some(site => url.includes(site));
}

function isProductPage(url) {
    // Amazon product page patterns
    if (url.includes('amazon.')) {
        return url.includes('/dp/') || url.includes('/gp/product/');
    }
    
    // Flipkart product page patterns
    if (url.includes('flipkart.com')) {
        return url.includes('/p/') && !url.includes('/search');
    }
    
    return false;
}

async function analyzeProduct(productUrl) {
    try {
        showLoading();

        // First try health check with timeout
        const healthResponse = await fetchWithTimeout(`${API_BASE_URL}/api/extension/health`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        }, API_TIMEOUT);

        if (!healthResponse.ok) {
            throw new Error('Server not available. Make sure the Flask app is running on http://localhost:5000');
        }

        // Perform analysis
        const response = await fetchWithTimeout(`${API_BASE_URL}/api/extension/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: productUrl,
                include_recommendations: true
            })
        }, API_TIMEOUT);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Analysis failed');
        }

        if (data.ok) {
            showResults(data);
            
            // Save to history
            chrome.runtime.sendMessage({
                action: 'saveToHistory',
                data: {
                    url: productUrl,
                    score: data.score,
                    title: data.title || 'Unknown Product'
                }
            });
        } else {
            throw new Error(data.error || 'Unknown error occurred');
        }

    } catch (error) {
        console.error('Analysis error:', error);
        showError(getErrorMessage(error));
    }
}

function fetchWithTimeout(url, options = {}, timeout = API_TIMEOUT) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
    ]);
}

function getErrorMessage(error) {
    const errorMessage = error.message || 'Analysis failed';
    
    if (errorMessage.includes('Server not available')) {
        return '⚠️ Server Not Running\n\nPlease start the Flask application:\npython app.py';
    } else if (errorMessage.includes('timeout')) {
        return '⏱️ Request Timeout\n\nThe server is taking too long to respond. Please try again.';
    } else if (errorMessage.includes('Failed to fetch')) {
        return '🔌 Connection Error\n\nCannot connect to the server. Check if the Flask app is running.';
    }
    return `❌ ${errorMessage}`;
}

function showLoading() {
    hideAllSections();
    loadingEl.style.display = 'block';
}

function showError(message) {
    hideAllSections();
    errorEl.style.display = 'block';
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    
    // Show notification
    showNotification(message, 'error');
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        z-index: 1000;
        max-width: 300px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        notification.remove();
    }, 4000);
}

function showResults(data, isDemoData = false) {
    hideAllSections();
    
    // Populate score
    document.getElementById('scoreValue').textContent = data.score || '--';
    
    // Set recommendation
    const recommendationEl = document.getElementById('recommendation');
    const recommendation = data.recommendation || 'Unknown';
    recommendationEl.textContent = recommendation;
    recommendationEl.className = 'recommendation ' + getRecommendationClass(data.score);
    
    // Populate pros
    const prosListEl = document.getElementById('prosList');
    prosListEl.innerHTML = '';
    if (data.pros && data.pros.length > 0) {
        data.pros.forEach(([aspect, sentiment]) => {
            const li = document.createElement('li');
            li.textContent = capitalizeFirst(aspect);
            prosListEl.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.textContent = 'No specific pros identified';
        li.style.fontStyle = 'italic';
        prosListEl.appendChild(li);
    }
    
    // Populate cons
    const consListEl = document.getElementById('consList');
    consListEl.innerHTML = '';
    if (data.cons && data.cons.length > 0) {
        data.cons.forEach(([aspect, sentiment]) => {
            const li = document.createElement('li');
            li.textContent = capitalizeFirst(aspect);
            consListEl.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.textContent = 'No major concerns identified';
        li.style.fontStyle = 'italic';
        consListEl.appendChild(li);
    }
    
    // Show recommendations if available
    if (data.recommendations && data.recommendations.length > 0) {
        showRecommendations(data.recommendations);
    }
    
    // Setup event listeners
    setupEventListeners(data);
    
    // Show demo data warning if applicable
    if (isDemoData) {
        showDemoDataWarning();
    }
    
    contentEl.style.display = 'block';
}

function showRecommendations(recommendations) {
    const recommendationsSection = document.getElementById('recommendationsSection');
    const recommendationsList = document.getElementById('recommendationsList');
    
    recommendationsList.innerHTML = '';
    
    recommendations.slice(0, 3).forEach(rec => {
        const item = document.createElement('div');
        item.className = 'recommendation-item';
        item.innerHTML = `
            <div class="recommendation-title">${rec.title || 'Alternative Product'}</div>
            <div class="recommendation-price">₹${rec.price ? formatPrice(rec.price) : 'N/A'}</div>
            <div class="recommendation-score">${rec.score || '--'}%</div>
        `;
        item.addEventListener('click', () => {
            if (rec.url) {
                chrome.tabs.create({ url: rec.url });
            }
        });
        recommendationsList.appendChild(item);
    });
    
    recommendationsSection.style.display = 'block';
}

function setupEventListeners(data) {
    // Play verdict button
    const playVerdictBtn = document.getElementById('playVerdictBtn');
    playVerdictBtn.addEventListener('click', () => {
        playVoiceVerdict(data.voice_verdict || 'Analysis complete');
    });
    
    // View full report button
    const viewFullBtn = document.getElementById('viewFullBtn');
    viewFullBtn.addEventListener('click', () => {
        const url = `${API_BASE_URL}/?url=${encodeURIComponent(data.product_url || '')}`;
        chrome.tabs.create({ url: url });
    });
    
    // Retry button
    const retryBtn = document.getElementById('retryBtn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            initializePopup();
        });
    }
}

function playVoiceVerdict(text) {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 0.8;
        
        // Try to use a better voice
        const voices = speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice => 
            voice.lang.includes('en') && 
            (voice.name.includes('Google') || voice.name.includes('Microsoft'))
        );
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        
        speechSynthesis.speak(utterance);
    } else {
        alert('Voice synthesis not available');
    }
}

function showError(message) {
    hideAllSections();
    document.getElementById('errorMessage').textContent = message;
    errorEl.style.display = 'block';
}

function showNotProductPage() {
    hideAllSections();
    notProductPageEl.style.display = 'block';
}

// Tab switching functionality
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    // Update button states
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    if (tabName === 'analysis') {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('loading').classList.add('active');
        document.querySelectorAll('.tab-button')[0].classList.add('active');
        loadAnalysisTab();
    } else if (tabName === 'history') {
        document.getElementById('history-tab').style.display = 'block';
        document.getElementById('history-tab').classList.add('active');
        document.querySelectorAll('.tab-button')[1].classList.add('active');
        loadHistory();
    } else if (tabName === 'bookmarks') {
        document.getElementById('bookmarks-tab').style.display = 'block';
        document.getElementById('bookmarks-tab').classList.add('active');
        document.querySelectorAll('.tab-button')[2].classList.add('active');
        loadBookmarks();
    }
}

function loadAnalysisTab() {
    // Re-run analysis for current product
    const [tab] = chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
            analyzeProduct(tabs[0].url);
        }
    });
}

function loadHistory() {
    chrome.runtime.sendMessage({action: 'getHistory'}, (history) => {
        const historyList = document.getElementById('historyList');
        const emptyHistory = document.getElementById('emptyHistory');
        
        historyList.innerHTML = '';
        
        if (history && history.length > 0) {
            emptyHistory.style.display = 'none';
            history.forEach(item => {
                const historyItemEl = document.createElement('div');
                historyItemEl.className = 'history-item';
                const date = new Date(item.timestamp).toLocaleDateString();
                historyItemEl.innerHTML = `
                    <div class="history-item-title">${item.title}</div>
                    <div class="history-item-meta">
                        <span>${date}</span>
                        <span class="history-item-score">${item.score}/100</span>
                    </div>
                `;
                historyItemEl.style.cursor = 'pointer';
                historyItemEl.addEventListener('click', () => {
                    chrome.runtime.sendMessage({
                        action: 'openFullReport',
                        url: `/results?url=${encodeURIComponent(item.url)}`
                    });
                });
                historyList.appendChild(historyItemEl);
            });
        } else {
            emptyHistory.style.display = 'block';
        }
    });
}

function loadBookmarks() {
    chrome.runtime.sendMessage({action: 'getBookmarks'}, (bookmarks) => {
        const bookmarksList = document.getElementById('bookmarksList');
        const emptyBookmarks = document.getElementById('emptyBookmarks');
        
        bookmarksList.innerHTML = '';
        
        if (bookmarks && bookmarks.length > 0) {
            emptyBookmarks.style.display = 'none';
            bookmarks.forEach(item => {
                const bookmarkItemEl = document.createElement('div');
                bookmarkItemEl.className = 'bookmark-item';
                const date = new Date(item.bookmarkedAt).toLocaleDateString();
                bookmarkItemEl.innerHTML = `
                    <div class="bookmark-item-title">${item.title}</div>
                    <div class="bookmark-item-meta">
                        <span>⭐ Score: ${item.score || '--'}/100</span>
                        <span style="float: right; cursor: pointer;" onclick="removeBookmarkItem('${item.url}')">✕</span>
                    </div>
                `;
                bookmarkItemEl.style.cursor = 'pointer';
                bookmarkItemEl.addEventListener('click', (e) => {
                    if (e.target.textContent !== '✕') {
                        chrome.runtime.sendMessage({
                            action: 'openFullReport',
                            url: `/results?url=${encodeURIComponent(item.url)}`
                        });
                    }
                });
                bookmarksList.appendChild(bookmarkItemEl);
            });
        } else {
            emptyBookmarks.style.display = 'block';
        }
    });
}

function removeBookmarkItem(url) {
    chrome.runtime.sendMessage({
        action: 'removeBookmark',
        url: url
    }, () => {
        loadBookmarks();
    });
}

// Bookmark button functionality
document.addEventListener('DOMContentLoaded', function() {
    const bookmarkBtn = document.getElementById('bookmarkBtn');
    if (bookmarkBtn) {
        bookmarkBtn.addEventListener('click', () => {
            const scoreValue = document.getElementById('scoreValue').textContent;
            const [tab] = chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0]) {
                    chrome.runtime.sendMessage({
                        action: 'bookmarkProduct',
                        data: {
                            url: tabs[0].url,
                            title: document.querySelector('.score-card').textContent || 'Product',
                            score: parseInt(scoreValue) || 0
                        }
                    }, (response) => {
                        showNotification(response.message, 'success');
                    });
                }
            });
        });
    }
    
    // Clear history button
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('Clear all analysis history?')) {
                chrome.storage.local.set({analysisHistory: []}, () => {
                    loadHistory();
                });
            }
        });
    }
    
    // Clear bookmarks button
    const clearBookmarksBtn = document.getElementById('clearBookmarksBtn');
    if (clearBookmarksBtn) {
        clearBookmarksBtn.addEventListener('click', () => {
            if (confirm('Clear all bookmarks?')) {
                chrome.storage.local.set({bookmarkedProducts: []}, () => {
                    loadBookmarks();
                });
            }
        });
    }
});

function showDemoDataWarning() {
    const warning = document.createElement('div');
    warning.style.cssText = `
        background: #fff3cd;
        border: 1px solid #ffeaa7;
        border-radius: 6px;
        padding: 10px;
        margin: 10px 0;
        font-size: 12px;
        color: #856404;
    `;
    warning.innerHTML = '<strong>Demo Data:</strong> Real analysis failed, showing sample results.';
    contentEl.insertBefore(warning, contentEl.firstChild);
}

function hideAllSections() {
    loadingEl.style.display = 'none';
    contentEl.style.display = 'none';
    errorEl.style.display = 'none';
    notProductPageEl.style.display = 'none';
}

function getRecommendationClass(score) {
    if (score >= 70) return 'recommended';
    if (score >= 50) return 'acceptable';
    return 'not-recommended';
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatPrice(price) {
    return new Intl.NumberFormat('en-IN').format(price);
}

// Load voices when available
if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = function() {
        console.log('Voices loaded for extension');
    };
}

// Handle extension errors
window.addEventListener('error', function(e) {
    console.error('Extension error:', e.error);
    showError('Extension error occurred');
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    showError('Network error occurred');
});