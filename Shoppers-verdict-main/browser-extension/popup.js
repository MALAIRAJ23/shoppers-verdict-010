// Shopper's Verdict Browser Extension - Popup Script

const API_BASE_URL = 'http://localhost:5000';
const SUPPORTED_SITES = ['amazon.in', 'amazon.com', 'flipkart.com'];

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

        // First try health check
        const healthResponse = await fetch(`${API_BASE_URL}/api/extension/health`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!healthResponse.ok) {
            throw new Error('Server not available');
        }

        // Perform analysis
        const response = await fetch(`${API_BASE_URL}/api/extension/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: productUrl,
                include_recommendations: true
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Analysis failed');
        }

        if (data.ok) {
            showResults(data);
        } else {
            throw new Error(data.error || 'Unknown error occurred');
        }

    } catch (error) {
        console.error('Analysis error:', error);
        
        // Try fallback with test endpoint
        try {
            const testResponse = await fetch(`${API_BASE_URL}/api/extension/test`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (testResponse.ok) {
                const testData = await testResponse.json();
                if (testData.ok) {
                    showResults(testData, true); // Mark as demo data
                    return;
                }
            }
        } catch (testError) {
            console.error('Test endpoint also failed:', testError);
        }

        showError(error.message || 'Analysis failed. Please try again.');
    }
}

function showLoading() {
    hideAllSections();
    loadingEl.style.display = 'block';
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