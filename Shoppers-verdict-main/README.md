# Shopper's Verdict

An AI-powered shopping assistant that analyzes product reviews and provides worth-to-buy scores for Amazon and Flipkart products.

## Features

- **Product Analysis**: Get detailed analysis of products with worth-to-buy scores (0-100)
- **Sentiment Analysis**: Understand what customers love and hate about products
- **Smart Recommendations**: Discover better alternatives with higher scores
- **Voice Verdict**: Listen to audio summaries of product analysis
- **Browser Extension**: Analyze products directly on Amazon/Flipkart pages
- **Offline Mode**: Basic analysis even when the server is unavailable

## Installation

### Web Application

1. Install required packages:
   ```
   pip install -r requirements.txt
   ```

2. Run the Flask application:
   ```
   python app.py
   ```

3. Access the web interface at http://localhost:5000

### Browser Extension

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `browser-extension` folder
6. The extension will appear in your toolbar

## Usage

### Web Interface

1. Visit http://localhost:5000
2. Paste an Amazon or Flipkart product URL
3. Click "Get AI Verdict" to analyze the product
4. View the worth-to-buy score, pros/cons, and recommendations

### Browser Extension

1. Navigate to any Amazon or Flipkart product page
2. Click the Shopper's Verdict icon in your browser toolbar
3. Click "Get Verdict" on the product page
4. View quick analysis results or full report

## Supported Sites

- Amazon (amazon.in, amazon.com)
- Flipkart (flipkart.com)

## Technologies Used

- Python/Flask (Backend)
- JavaScript/HTML/CSS (Frontend)
- Chrome Extension APIs
- Bootstrap 5 (Styling)
- Natural Language Processing (NLP)

## License

This project is for educational purposes only.
"# shoppers-verdict-010" 
