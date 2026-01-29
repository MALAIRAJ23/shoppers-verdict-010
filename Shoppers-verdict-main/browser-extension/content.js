// Content script for Shopper's Verdict extension
// Detects Amazon/Flipkart product pages and provides analysis interface

(function() {
    'use strict';
    
    // Add keyboard shortcut listener
    document.addEventListener('keydown', handleKeyboardShortcut);
    
    function handleKeyboardShortcut(event) {
        // Alt + Shift + V to trigger analysis (or Ctrl + Shift + V on Mac)
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const isValidShortcut = isMac 
            ? (event.ctrlKey && event.shiftKey && event.key === 'V')
            : (event.altKey && event.shiftKey && event.key === 'V');
        
        if (isValidShortcut) {
            event.preventDefault();
            triggerProductAnalysis();
        }
    }
    
    function triggerProductAnalysis() {
        console.log('Keyboard shortcut triggered analysis');
        chrome.runtime.sendMessage({action: 'triggerAnalysis'}, (response) => {
            if (chrome.runtime.lastError) {
                console.log('Opening popup instead...');
                // Popup will open automatically
            }
        });
    }
    
    // Configuration
    const CONFIG = {
        API_BASE_URL: 'http://localhost:5000',
        SUPPORTED_SITES: {
            amazon: {
                domains: ['amazon.in', 'amazon.com'],
                productPatterns: [
                    /\/dp\/[A-Z0-9]{10}/,
                    /\/gp\/product\/[A-Z0-9]{10}/,
                    /\/product\/[A-Z0-9]{10}/,
                    /\/[^/]*\/dp\/[A-Z0-9]{10}/,
                    /\/[^/]*\/gp\/product\/[A-Z0-9]{10}/
                ],
                selectors: {
                    title: '#productTitle, .product-title, h1[data-automation-id="product-title"], .x-item-title-label, [data-cel-widget="title"], h1 a, h1 span',
                    price: '.a-price-whole, .a-price .a-offscreen, .a-price-current, .notranslate, ._30jeq3, .a-offscreen, .a-price .a-text-price, ._3I9_wc, .Nx9bqj',
                    image: '#landingImage, .a-dynamic-image, ._396cs4, .s-image, #imgTagWrapperId img, .imgTagWrapper img, ._2r_T1I, .CXW8mj'
                }
            },
            flipkart: {
                domains: ['flipkart.com'],
                productPatterns: [
                    /\/p\/[a-zA-Z0-9\-]+/,
                    /\/[^/]+\/p\/[a-zA-Z0-9\-]+/
                ],
                selectors: {
                    title: '.VU-ZEz, .yhB1nd, .B_NuCI, ._35KyD6, span.B_NuCI, .Nx9bqj, .x-item-title-label, h1, ._1h8-S, h1 span, ._2whKm7',
                    price: '._30jeq3, ._1_WHN1, .CEmiEU, .Nx9bqj, ._16Jk6d, ._3I9_wc, ._25b18c, ._31qSD5, ._3I9_wc span',
                    image: '._396cs4, ._2r_T1I, .CXW8mj, ._2amPTt, .q6DClP, img, .Jl5PuX, ._2r_T1I img'
                }
            }
        }
    };
    
    let currentProductData = null;
    let analysisResult = null;
    let injectedButton = null;
    
    // Utility functions
    function getCurrentSite() {
        const hostname = window.location.hostname.toLowerCase();
        for (const [site, config] of Object.entries(CONFIG.SUPPORTED_SITES)) {
            if (config.domains.some(domain => hostname.includes(domain))) {
                return { site, config };
            }
        }
        return null;
    }
    
    function isProductPage() {
        const siteInfo = getCurrentSite();
        if (!siteInfo) return false;
        
        const url = window.location.href;
        console.log('Checking URL:', url);
        
        // Check against all patterns for the site
        const isMatch = siteInfo.config.productPatterns.some(pattern => {
            const match = pattern.test(url);
            console.log('Pattern:', pattern, 'Match:', match);
            return match;
        });
        
        // Additional checks for product page elements
        if (isMatch) {
            // For Amazon, check if product title exists
            if (siteInfo.site === 'amazon') {
                const titleElement = document.querySelector('#productTitle, .product-title, h1[data-automation-id="product-title"], [data-cel-widget="title"]');
                if (!titleElement) {
                    console.log('Amazon product page detected but no title found');
                    // Try alternative selectors
                    const altTitle = document.querySelector('h1 a, h1 span, .qa-title-text');
                    if (!altTitle) {
                        return false;
                    }
                }
            }
            // For Flipkart, check if product title exists
            else if (siteInfo.site === 'flipkart') {
                const titleElement = document.querySelector('.VU-ZEz, .yhB1nd, .B_NuCI, ._35KyD6, .Nx9bqj');
                if (!titleElement) {
                    console.log('Flipkart product page detected but no title found');
                    // Try alternative selectors
                    const altTitle = document.querySelector('h1 span, h1 div, ._2whKm7');
                    if (!altTitle) {
                        return false;
                    }
                }
            }
        }
        
        console.log('Overall match result:', isMatch);
        return isMatch;
    }
    
    function extractProductData() {
        const siteInfo = getCurrentSite();
        if (!siteInfo || !isProductPage()) {
            console.log('Not a product page or unsupported site');
            return null;
        }
        
        const data = {
            url: window.location.href,
            site: siteInfo.site,
            title: null,
            price: null,
            image: null
        };
        
        console.log('Extracting data for site:', siteInfo.site);
        
        // Extract title with multiple attempts
        const titleSelectors = siteInfo.config.selectors.title.split(', ');
        for (const selector of titleSelectors) {
            const titleElement = document.querySelector(selector);
            if (titleElement) {
                data.title = titleElement.textContent?.trim() || titleElement.innerText?.trim() || '';
                console.log('Found title with selector:', selector, 'Title:', data.title);
                if (data.title) break;
            }
        }
        
        // If title not found, try alternative approaches
        if (!data.title) {
            // Try meta tags
            const metaTitle = document.querySelector('meta[property="og:title"]');
            if (metaTitle) {
                data.title = metaTitle.getAttribute('content') || '';
            }
        }
        
        // Extract price with multiple attempts
        const priceSelectors = siteInfo.config.selectors.price.split(', ');
        for (const selector of priceSelectors) {
            const priceElement = document.querySelector(selector);
            if (priceElement) {
                data.price = priceElement.textContent?.trim() || priceElement.innerText?.trim() || '';
                console.log('Found price with selector:', selector, 'Price:', data.price);
                if (data.price) break;
            }
        }
        
        // Extract image with multiple attempts
        const imageSelectors = siteInfo.config.selectors.image.split(', ');
        for (const selector of imageSelectors) {
            const imageElement = document.querySelector(selector);
            if (imageElement) {
                data.image = imageElement.src || imageElement.getAttribute('data-src') || imageElement.getAttribute('data-original') || '';
                console.log('Found image with selector:', selector, 'Image:', data.image);
                if (data.image) break;
            }
        }
        
        // If image not found, try meta tags
        if (!data.image) {
            const metaImage = document.querySelector('meta[property="og:image"]');
            if (metaImage) {
                data.image = metaImage.getAttribute('content') || '';
            }
        }
        
        console.log('Extracted product data:', data);
        return data;
    }
    
    // Analysis functions
    async function analyzeProduct(productUrl) {
        try {
            console.log('Content script: Starting analysis for:', productUrl);
            
            // First check if server is available
            const healthResponse = await fetch(`${CONFIG.API_BASE_URL}/api/extension/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            
            if (healthResponse.ok) {
                // Try main analysis endpoint with extended timeout
                const response = await fetch(`${CONFIG.API_BASE_URL}/api/extension/analyze`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        url: productUrl,
                        include_recommendations: true 
                    }),
                    signal: AbortSignal.timeout(45000) // 45 second timeout
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.ok) {
                        console.log('Content script: Real analysis successful');
                        return result;
                    } else {
                        throw new Error(result.error || 'Analysis failed');
                    }
                } else {
                    // Try to get more detailed error information
                    let errorText = `HTTP ${response.status}`;
                    try {
                        const errorData = await response.json();
                        errorText = errorData.error || errorText;
                    } catch (e) {
                        // Ignore if we can't parse error JSON
                    }
                    throw new Error(errorText);
                }
            } else {
                throw new Error('Server unavailable');
            }
            
        } catch (error) {
            console.warn('Content script: Analysis failed, using offline fallback:', error.message);
            
            // Generate offline analysis
            const productData = extractProductData();
            if (productData) {
                return generateOfflineAnalysis(productData);
            } else {
                throw new Error('Cannot analyze - no product data available');
            }
        }
    }
    
    function generateOfflineAnalysis(productData) {
        const title = productData.title || 'Product';
        
        // Basic scoring algorithm
        let score = 60;
        const titleLower = title.toLowerCase();
        
        // Brand recognition
        const premiumBrands = ['samsung', 'apple', 'lg', 'sony', 'dell', 'hp', 'asus'];
        const budgetBrands = ['micromax', 'intex', 'karbonn'];
        
        premiumBrands.forEach(brand => {
            if (titleLower.includes(brand)) score += 12;
        });
        budgetBrands.forEach(brand => {
            if (titleLower.includes(brand)) score -= 5;
        });
        
        // Product type specific scoring
        if (titleLower.includes('refrigerator')) {
            score += 5; // Essential appliance
        } else if (titleLower.includes('phone') || titleLower.includes('smartphone')) {
            score += 8; // High utility
        }
        
        score = Math.max(35, Math.min(90, score));
        
        return {
            ok: true,
            score: Math.round(score),
            recommendation: score >= 70 ? 'Recommended' : score >= 50 ? 'Acceptable' : 'Not Recommended',
            pros: [['features', 0.6], ['build_quality', 0.5]],
            cons: [['price', -0.3], ['availability', -0.2]],
            voice_verdict: `Offline analysis: ${title} scores ${Math.round(score)}%. This is a basic assessment. Connect to internet for detailed review analysis.`,
            product_title: `${title} (Offline)`,
            product_url: productData.url,
            reviews_analyzed: 0,
            processing_time: 0.1,
            recommendations: [],
            meta: {
                confidence: 0.4,
                data_quality: 0.3,
                offline_mode: true
            }
        };
    }
    
    // UI injection functions
    function createAnalysisButton() {
        if (injectedButton) return;
        
        const button = document.createElement('div');
        button.id = 'shoppers-verdict-button';
        button.innerHTML = `
            <div class="sv-button-container">
                <button class="sv-analyze-btn">
                    <span class="sv-icon">🛒</span>
                    <span class="sv-text">Get Verdict</span>
                    <span class="sv-loading" style="display: none;">⏳</span>
                </button>
            </div>
        `;
        
        // Position the button based on site
        const siteInfo = getCurrentSite();
        let insertionPoint = null;
        
        if (siteInfo.site === 'amazon') {
            // Try multiple Amazon insertion points in order of preference
            const amazonSelectors = [
                '#corePriceDisplay_desktop_feature_div',
                '#priceblock_ourprice',
                '#priceblock_dealprice',
                '.a-price-range',
                '#apex_desktop',
                '#desktop_buybox',
                '#buybox',
                '#price',
                '.buyingOptions'
            ];
            
            for (const selector of amazonSelectors) {
                insertionPoint = document.querySelector(selector);
                if (insertionPoint) {
                    console.log('Found Amazon insertion point:', selector);
                    break;
                }
            }
        } else if (siteInfo.site === 'flipkart') {
            // Try multiple Flipkart insertion points
            const flipkartSelectors = [
                '._30jeq3',
                '._16Jk6d',
                '._1vC4OE',
                '._3LWZlK',
                '.CEmiEU',
                '.Nx9bqj',
                '._25b18c',
                '._3I9_wc',
                '.col.col-7-12',
                '.col.col-5-12',
                '._1AtVbE',
                '.row',
                '._1YokD2'
            ];
            
            for (const selector of flipkartSelectors) {
                insertionPoint = document.querySelector(selector);
                if (insertionPoint) {
                    console.log('Found Flipkart insertion point:', selector);
                    break;
                }
            }
        }
        
        if (insertionPoint) {
            // Try to insert after the element first
            if (insertionPoint.parentNode) {
                insertionPoint.parentNode.insertBefore(button, insertionPoint.nextSibling);
                injectedButton = button;
                console.log('Button injected successfully after:', insertionPoint.className || insertionPoint.tagName);
            } else {
                // If that fails, append to the element
                insertionPoint.appendChild(button);
                injectedButton = button;
                console.log('Button injected successfully inside:', insertionPoint.className || insertionPoint.tagName);
            }
            
            // Add click handler
            const analyzeBtn = button.querySelector('.sv-analyze-btn');
            analyzeBtn.addEventListener('click', handleAnalyzeClick);
        } else {
            console.log('No suitable insertion point found, using fallback for', siteInfo.site);
            
            // Enhanced fallback for different sites
            let fallbackParent = null;
            
            // Try to find a good parent container
            if (siteInfo.site === 'amazon') {
                fallbackParent = document.querySelector('#centerCol') || 
                               document.querySelector('#rightCol') || 
                               document.querySelector('#leftCol') ||
                               document.querySelector('#buybox') ||
                               document.querySelector('#titleSection') ||
                               document.querySelector('main') ||
                               document.querySelector('#content') ||
                               document.body;
            } else if (siteInfo.site === 'flipkart') {
                fallbackParent = document.querySelector('._1YokD2') || 
                               document.querySelector('._1AtVbE') || 
                               document.querySelector('.row') ||
                               document.querySelector('._3I9_wc') ||
                               document.querySelector('._30jeq3') ||
                               document.querySelector('main') ||
                               document.querySelector('#container') ||
                               document.body;
            } else {
                fallbackParent = document.querySelector('main') || 
                               document.querySelector('#content') ||
                               document.body;
            }
            
            // Create a container with better styling
            const container = document.createElement('div');
            container.style.cssText = 'position: relative; margin: 15px 0; z-index: 10000;';
            container.appendChild(button);
            
            if (fallbackParent) {
                // Try to insert at the top of the parent
                if (fallbackParent.firstChild) {
                    fallbackParent.insertBefore(container, fallbackParent.firstChild);
                } else {
                    fallbackParent.appendChild(container);
                }
                injectedButton = button;
                console.log('Button injected via enhanced fallback');
            } else {
                // Final fallback to fixed position
                container.style.cssText = 'position: fixed; top: 70px; right: 10px; z-index: 999999; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);';
                document.body.appendChild(container);
                injectedButton = button;
                console.log('Button injected via fixed position fallback');
            }
            
            // Add click handler
            const analyzeBtn = button.querySelector('.sv-analyze-btn');
            analyzeBtn.addEventListener('click', handleAnalyzeClick);
        }
    }
    
    function createQuickResults(result) {
        // Remove existing quick results
        const existing = document.getElementById('shoppers-verdict-results');
        if (existing) existing.remove();
        
        const resultsDiv = document.createElement('div');
        resultsDiv.id = 'shoppers-verdict-results';
        resultsDiv.innerHTML = `
            <div class="sv-results-container">
                <div class="sv-results-header">
                    <span class="sv-logo">🛒 Shopper's Verdict</span>
                    <button class="sv-close-btn">×</button>
                </div>
                <div class="sv-score-section">
                    <div class="sv-score-value">${result.score}%</div>
                    <div class="sv-score-label">Worth-to-Buy Score</div>
                    <div class="sv-recommendation ${result.recommendation.toLowerCase().replace(' ', '-')}">${result.recommendation}</div>
                </div>
                <div class="sv-quick-summary">
                    <div class="sv-pros">
                        <strong>👍 Pros:</strong> ${result.pros.map(p => p[0]).join(', ')}
                    </div>
                    <div class="sv-cons">
                        <strong>👎 Cons:</strong> ${result.cons.map(c => c[0]).join(', ')}
                    </div>
                </div>
                <div class="sv-actions">
                    <button class="sv-action-btn sv-voice-btn">🔊 Play Verdict</button>
                    <button class="sv-action-btn sv-full-btn">📊 Full Report</button>
                </div>
                ${result.recommendations && result.recommendations.length > 0 ? `
                    <div class="sv-recommendations">
                        <div class="sv-rec-title">🎯 Better Alternatives:</div>
                        ${result.recommendations.slice(0, 2).map(rec => `
                            <div class="sv-rec-item">
                                <span class="sv-rec-name">${rec.title}</span>
                                <span class="sv-rec-score">${rec.score}%</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
        
        // Insert after the analyze button
        if (injectedButton) {
            injectedButton.parentNode.insertBefore(resultsDiv, injectedButton.nextSibling);
        }
        
        // Add event listeners
        resultsDiv.querySelector('.sv-close-btn').addEventListener('click', () => {
            resultsDiv.remove();
        });
        
        resultsDiv.querySelector('.sv-voice-btn').addEventListener('click', () => {
            playVoiceVerdict(result.voice_verdict);
        });
        
        resultsDiv.querySelector('.sv-full-btn').addEventListener('click', () => {
            openFullReport(result);
        });
    }
    
    // Event handlers
    async function handleAnalyzeClick(event) {
        const button = event.target.closest('.sv-analyze-btn');
        const textSpan = button.querySelector('.sv-text');
        const loadingSpan = button.querySelector('.sv-loading');
        
        // Show loading state
        textSpan.style.display = 'none';
        loadingSpan.style.display = 'inline';
        button.disabled = true;
        
        try {
            const productData = extractProductData();
            if (!productData) {
                throw new Error('Could not extract product data');
            }
            
            currentProductData = productData;
            analysisResult = await analyzeProduct(productData.url);
            
            createQuickResults(analysisResult);
            
            // Store data for popup
            try {
                await chrome.storage.local.set({
                    currentAnalysis: analysisResult,
                    currentProduct: productData
                });
            } catch (storageError) {
                console.warn('Storage error:', storageError);
                // Continue without storage
            }
            
        } catch (error) {
            console.error('Analysis error:', error);
            alert('Failed to analyze product. Please try again.');
        } finally {
            // Reset button state
            textSpan.style.display = 'inline';
            loadingSpan.style.display = 'none';
            button.disabled = false;
        }
    }
    
    function playVoiceVerdict(text) {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel(); // Stop any ongoing speech
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.9;
            utterance.pitch = 1;
            speechSynthesis.speak(utterance);
        } else {
            alert('Voice synthesis not supported in this browser');
        }
    }
    
    function openFullReport(result) {
        if (currentProductData) {
            // Navigate to the main page with URL parameter for GET request
            const baseUrl = `${CONFIG.API_BASE_URL}/`;
            const params = new URLSearchParams({
                url: currentProductData.url
            });
            const fullUrl = `${baseUrl}?${params.toString()}`;
            
            console.log('Opening full analysis report:', fullUrl);
            window.open(fullUrl, '_blank');
        } else {
            // Fallback: construct URL from current page
            const currentUrl = window.location.href;
            const analyzeUrl = `${CONFIG.API_BASE_URL}/?url=${encodeURIComponent(currentUrl)}`;
            console.log('Opening full report for current URL:', analyzeUrl);
            window.open(analyzeUrl, '_blank');
        }
    }
    
    // Message handling from popup/background
    if (chrome && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            try {
                console.log('Content script received message:', request);
                
                if (request.action === 'getProductData') {
                    const productData = extractProductData();
                    const isProduct = isProductPage();
                    console.log('Responding with product data:', { productData, analysisResult, isProduct });
                    sendResponse({ 
                        productData, 
                        analysisResult,
                        isProductPage: isProduct 
                    });
                } else if (request.action === 'analyzeProduct') {
                    const analyzeBtn = injectedButton?.querySelector('.sv-analyze-btn');
                    if (analyzeBtn) {
                        handleAnalyzeClick({ target: analyzeBtn });
                    }
                    sendResponse({ success: true });
                } else if (request.action === 'playVerdict') {
                    playVoiceVerdict(request.text);
                    sendResponse({ success: true });
                }
            } catch (error) {
                console.error('Content script message error:', error);
                sendResponse({ success: false, error: error.message });
            }
            return true; // Keep message channel open for async response
        });
    }
    
    // Initialization
    function init() {
        console.log('Shopper\'s Verdict: Initializing on', window.location.href);
        console.log('Document ready state:', document.readyState);
        
        const siteInfo = getCurrentSite();
        console.log('Site info:', siteInfo);
        
        if (!siteInfo) {
            console.log('Shopper\'s Verdict: Unsupported site');
            return;
        }
        
        // Wait for page to be fully loaded
        if (document.readyState !== 'complete') {
            console.log('Waiting for page to load completely...');
            setTimeout(init, 1000);
            return;
        }
        
        if (isProductPage()) {
            console.log('Shopper\'s Verdict: Product page detected');
            
            // Store product data for popup
            const productData = extractProductData();
            if (productData && productData.title) {
                console.log('Shopper\'s Verdict: Product data extracted:', productData.title);
                try {
                    if (chrome && chrome.storage && chrome.storage.local) {
                        chrome.storage.local.set({ currentProduct: productData });
                    }
                } catch (storageError) {
                    console.warn('Storage error in init:', storageError);
                }
                
                // Create button with retry mechanism
                function attemptButtonCreation(attempts = 0) {
                    const maxAttempts = 8; // Increased attempts
                    const delay = Math.min(1000 * Math.pow(1.5, attempts), 5000); // Faster retries
                    
                    console.log(`Attempt ${attempts + 1} to create button on ${siteInfo.site}`);
                    
                    if (attempts < maxAttempts) {
                        setTimeout(() => {
                            createAnalysisButton();
                            if (!injectedButton) {
                                console.log('Button creation failed, retrying...');
                                
                                // For Flipkart, try additional debugging
                                if (siteInfo.site === 'flipkart') {
                                    console.log('Flipkart page - checking available elements:');
                                    const testSelectors = ['._30jeq3', '._16Jk6d', '.col', '[class*="price"]', '[class*="_"]', '._1AtVbE'];
                                    testSelectors.forEach(sel => {
                                        const found = document.querySelector(sel);
                                        console.log(`  ${sel}: ${!!found}`);
                                    });
                                }
                                
                                attemptButtonCreation(attempts + 1);
                            } else {
                                console.log('Button created successfully on', siteInfo.site);
                                
                                // Add mutation observer to re-inject if page changes
                                const observer = new MutationObserver((mutations) => {
                                    let shouldReinject = false;
                                    for (const mutation of mutations) {
                                        if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                                            for (const node of mutation.removedNodes) {
                                                if (node.id === 'shoppers-verdict-button' || 
                                                    (node.querySelector && node.querySelector('#shoppers-verdict-button'))) {
                                                    shouldReinject = true;
                                                    break;
                                                }
                                            }
                                        }
                                        if (shouldReinject) break;
                                    }
                                    
                                    if (shouldReinject) {
                                        console.log('Button removed, reinjecting...');
                                        injectedButton = null;
                                        setTimeout(createAnalysisButton, 500);
                                        observer.disconnect(); // Stop observing after reinjecting
                                    }
                                });
                                
                                observer.observe(document.body, { childList: true, subtree: true });
                            }
                        }, delay);
                    } else {
                        console.error('Failed to create button after maximum attempts on', siteInfo.site);
                        // Force fallback injection
                        console.log('Forcing fallback button injection for', siteInfo.site);
                        createAnalysisButton();
                    }
                }
                
                attemptButtonCreation();
            } else {
                console.log('Shopper\'s Verdict: Could not extract product data, will retry');
                // Retry extraction after more page loading
                setTimeout(() => {
                    const retryData = extractProductData();
                    if (retryData && retryData.title) {
                        console.log('Retry successful, creating button');
                        createAnalysisButton();
                    } else {
                        // Try one more time with a longer delay
                        setTimeout(() => {
                            const finalRetry = extractProductData();
                            if (finalRetry && finalRetry.title) {
                                console.log('Final retry successful, creating button');
                                createAnalysisButton();
                            } else {
                                console.log('All retries failed, using fallback');
                                createAnalysisButton();
                            }
                        }, 3000);
                    }
                }, 2000);
            }
        } else {
            console.log('Shopper\'s Verdict: Not a product page:', window.location.href);
            // Clear stored data if not on product page
            try {
                if (chrome && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.remove(['currentProduct', 'currentAnalysis']);
                }
            } catch (storageError) {
                console.warn('Storage cleanup error:', storageError);
            }
        }
    }
    
    // Handle dynamic page changes (SPAs)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            // Clean up previous injection
            if (injectedButton) {
                injectedButton.remove();
                injectedButton = null;
            }
            const existing = document.getElementById('shoppers-verdict-results');
            if (existing) existing.remove();
            
            // Re-initialize
            setTimeout(init, 500);
        }
    }).observe(document, { subtree: true, childList: true });
    
    // Initial setup
    init();
})();