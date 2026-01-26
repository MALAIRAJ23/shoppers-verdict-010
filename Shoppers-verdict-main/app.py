from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import traceback
import time
from datetime import datetime

# Import modules
try:
    from scraper import scrape_data, detect_product_category
    from analyzer import perform_analysis, analyze_product_description, EnhancedAnalyzer
    ENHANCED_MODULES = True
except ImportError as e:
    print(f"Error importing modules: {e}")
    print("Please ensure all required modules are available.")
    ENHANCED_MODULES = False

try:
    from recommendation_engine import get_product_recommendations
    RECOMMENDATIONS_AVAILABLE = True
except ImportError:
    RECOMMENDATIONS_AVAILABLE = False
    print("Recommendation engine not available")

class ExceptionMiddleware:
    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        try:
            return self.app(environ, start_response)
        except Exception:
            error_traceback = traceback.format_exc()
            start_response('500 INTERNAL SERVER ERROR', [('Content-Type', 'text/plain')])
            return [error_traceback.encode('utf-8')]

app = Flask(__name__)
CORS(app, origins=['*'], allow_headers=['Content-Type'], methods=['GET', 'POST', 'OPTIONS'])
app.wsgi_app = ExceptionMiddleware(app.wsgi_app)

@app.route('/', methods=['GET', 'POST'])
def index():
    """Enhanced main page with better error handling"""
    if request.method == 'GET':
        product_url = request.args.get('url')
        if product_url:
            return analyze_product(product_url)
        else:
            return render_template('index.html')
    else:
        product_url = request.form.get('product_url')
        if not product_url:
            return render_template('error.html', message="No product URL was provided.")
        return analyze_product(product_url)

def analyze_product(product_url):
    """Enhanced product analysis with better error handling and features"""
    try:
        # Normalize URL
        if not product_url.lower().startswith(('http://', 'https://')):
            product_url = 'https://' + product_url.lstrip('/ ')

        print(f"Starting analysis for: {product_url}")
        start_time = time.time()

        # 1. Scrape data with enhanced scraper
        data = scrape_data(product_url)
        
        if not data or not data.get('reviews'):
            error_message = """
            <div style="text-align: center; padding: 2rem;">
                <h3>Unable to Analyze This Product</h3>
                <p>This could be due to:</p>
                <ul style="text-align: left; max-width: 400px; margin: 1rem auto;">
                    <li>The product page doesn't have customer reviews</li>
                    <li>The website is blocking automated access</li>
                    <li>The product URL might be invalid</li>
                    <li>Network connectivity issues</li>
                </ul>
                <p><strong>Try:</strong> A different product URL with customer reviews</p>
                <a href="/" class="btn btn-primary" style="margin-top: 1rem;">Try Another Product</a>
            </div>
            """
            return render_template('error.html', message=error_message)

        reviews = data['reviews']
        product_title = data.get('title', 'Unknown Product')
        product_description = data.get('description', '')
        product_category = data.get('category', 'general')
        is_sample_data = data.get('source') == 'sample_data'

        print(f"Found {len(reviews)} reviews for analysis")

        # 2. Enhanced analysis
        if ENHANCED_MODULES:
            analysis_results = perform_analysis(reviews, product_category)
        else:
            analysis_results = perform_analysis(reviews)
        
        description_analysis = analyze_product_description(product_description, product_category)

        # 3. Enhanced scoring with category awareness
        if ENHANCED_MODULES:
            analyzer = EnhancedAnalyzer()
            aspects = analysis_results.get("aspect_sentiments", {})
            score = analyzer.calculate_enhanced_score(
                reviews, aspects, product_category, data.get('price_history')
            )
            
            # Generate enhanced insights
            insight = analyzer.generate_insights(reviews, aspects, score, product_category)
        else:
            # Fallback scoring
            overall = analysis_results.get("overall_sentiment", {})
            aspects = analysis_results.get("aspect_sentiments", {})
            
            total_reviews = sum(overall.values())
            if total_reviews > 0:
                positive_ratio = overall.get("positive", 0) / total_reviews
                score = positive_ratio * 100
            else:
                score = 50
            
            insight = f"Analysis based on {len(reviews)} reviews. Product category: {product_category.title()}."

        # 4. Generate pros and cons with better filtering
        sorted_aspects = sorted(aspects.items(), key=lambda x: x[1], reverse=True)
        
        # Enhanced pros/cons selection
        pros = []
        cons = []
        
        for aspect, sentiment in sorted_aspects:
            if sentiment > 0.1 and len(pros) < 3:
                pros.append((aspect, sentiment))
            elif sentiment < -0.1 and len(cons) < 3:
                cons.append((aspect, sentiment))
        
        # Ensure we have at least 2 of each
        if len(pros) < 2 and sorted_aspects:
            for aspect, sentiment in sorted_aspects:
                if (aspect, sentiment) not in pros and len(pros) < 2:
                    pros.append((aspect, sentiment))
        
        if len(cons) < 2 and sorted_aspects:
            for aspect, sentiment in reversed(sorted_aspects):
                if (aspect, sentiment) not in cons and len(cons) < 2:
                    cons.append((aspect, sentiment))

        # 5. Voice verdict generation
        voice_verdict = generate_enhanced_voice_verdict(score, pros, cons, product_category)

        # 6. Get recommendations
        recommendations = []
        if RECOMMENDATIONS_AVAILABLE:
            try:
                recommendations = get_product_recommendations(
                    product_url, product_title, product_description, limit=3
                )
            except Exception as e:
                print(f"Recommendation error: {e}")

        # 7. Prepare aspect data for visualization
        aspect_data = []
        for aspect, sentiment in analysis_results.get("aspect_sentiments", {}).items():
            width = min(abs(sentiment) * 100, 100)
            aspect_data.append({
                'name': aspect,
                'sentiment': sentiment,
                'width': width,
                'examples': analysis_results.get("aspect_support", {}).get(aspect, [])[:2]
            })

        # Sort by absolute sentiment strength
        aspect_data.sort(key=lambda x: abs(x['sentiment']), reverse=True)

        processing_time = time.time() - start_time
        print(f"Analysis completed in {processing_time:.2f} seconds")

        # 8. Render enhanced results
        return render_template(
            'results.html',
            score=round(score),
            pros=pros,
            cons=cons,
            analysis=analysis_results,
            aspect_data=aspect_data,
            product_url=product_url,
            product_title=product_title,
            product_description=product_description,
            description_analysis=description_analysis,
            price_history=data.get('price_history', []),
            voice_verdict=voice_verdict,
            insight=insight,
            recommendations=recommendations,
            is_sample_data=is_sample_data,
            processing_time=round(processing_time, 2),
            category=product_category
        )

    except Exception as e:
        print(f"Analysis error: {str(e)}")
        error_message = f"""
        <div style="text-align: center; padding: 2rem;">
            <h3>Analysis Error</h3>
            <p>An unexpected error occurred during analysis:</p>
            <code style="background: #f5f5f5; padding: 0.5rem; border-radius: 4px; display: block; margin: 1rem 0;">
                {str(e)}
            </code>
            <p>Please try again with a different product URL.</p>
            <a href="/" class="btn btn-primary">Try Again</a>
        </div>
        """
        return render_template('error.html', message=error_message)

def generate_enhanced_voice_verdict(score, pros, cons, category):
    """Generate category-aware voice verdict"""
    
    # Category-specific introductions
    category_intros = {
        'smartphone': "This smartphone",
        'laptop': "This laptop", 
        'tv': "This television",
        'headphones': "These headphones",
        'camera': "This camera",
        'tablet': "This tablet",
        'watch': "This smartwatch"
    }
    
    intro = category_intros.get(category, "This product")
    
    # Recommendation based on score
    if score >= 75:
        recommendation = "comes highly recommended"
        strength = "excellent"
    elif score >= 60:
        recommendation = "is a solid choice"
        strength = "good"
    elif score >= 40:
        recommendation = "has mixed reviews"
        strength = "average"
    else:
        recommendation = "may not be the best option"
        strength = "below average"
    
    verdict = f"{intro} {recommendation} with a {strength} score of {round(score)} out of 100."
    
    # Add category-specific pros
    if pros:
        if category == 'smartphone':
            verdict += f" Users particularly love the {pros[0][0]}"
            if len(pros) > 1:
                verdict += f" and {pros[1][0]}"
        elif category == 'laptop':
            verdict += f" The {pros[0][0]} receives excellent feedback"
            if len(pros) > 1:
                verdict += f", along with the {pros[1][0]}"
        else:
            verdict += f" Customers appreciate the {pros[0][0]}"
            if len(pros) > 1:
                verdict += f" and {pros[1][0]}"
    
    # Add concerns
    if cons:
        verdict += f". However, some users have concerns about the {cons[0][0]}"
        if len(cons) > 1:
            verdict += f" and {cons[1][0]}"
    
    # Category-specific conclusions
    if score >= 70:
        if category in ['smartphone', 'laptop']:
            verdict += ". This is a reliable choice for most users."
        else:
            verdict += ". Overall, this is a quality product worth considering."
    elif score >= 50:
        verdict += ". Consider your specific needs before purchasing."
    else:
        verdict += ". You might want to explore other options."
    
    return verdict

@app.route('/features')
def features():
    """Enhanced features page"""
    return render_template('features.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    """Handle form submission"""
    product_url = request.form.get('product_url')
    if not product_url:
        return render_template('error.html', message="No product URL was provided.")
    return analyze_product(product_url)

# Enhanced API endpoints for browser extension
@app.route('/api/extension/analyze', methods=['POST', 'OPTIONS'])
def api_extension_analyze():
    """Enhanced API endpoint with better error handling"""
    if request.method == 'OPTIONS':
        return jsonify(ok=True)
    
    try:
        data = request.get_json(silent=True) or {}
        product_url = data.get('url', '').strip()
        include_recommendations = data.get('include_recommendations', False)
        
        if not product_url:
            return jsonify(ok=False, error="Missing 'url' parameter"), 400
        
        # Normalize URL
        if not product_url.lower().startswith(('http://', 'https://')):
            product_url = 'https://' + product_url.lstrip('/ ')
        
        start_time = time.time()
        print(f"API: Analyzing {product_url}")
        
        # Scrape and analyze
        scraped_data = scrape_data(product_url)
        
        if not scraped_data or not scraped_data.get('reviews'):
            return jsonify(ok=False, error='No reviews found for analysis'), 502
        
        reviews = scraped_data['reviews']
        product_title = scraped_data.get('title', 'Unknown Product')
        product_description = scraped_data.get('description', '')
        category = scraped_data.get('category', 'general')
        
        # Enhanced analysis
        if ENHANCED_MODULES:
            analysis_results = perform_analysis(reviews, category)
            analyzer = EnhancedAnalyzer()
            aspects = analysis_results.get("aspect_sentiments", {})
            score = analyzer.calculate_enhanced_score(reviews, aspects, category)
        else:
            analysis_results = perform_analysis(reviews)
            overall = analysis_results.get("overall_sentiment", {})
            total_reviews = sum(overall.values())
            score = (overall.get("positive", 0) / total_reviews * 100) if total_reviews > 0 else 50
        
        # Generate pros/cons
        aspects = analysis_results.get("aspect_sentiments", {})
        sorted_aspects = sorted(aspects.items(), key=lambda x: x[1], reverse=True)
        
        pros = [(a, s) for a, s in sorted_aspects if s > 0.1][:2]
        cons = [(a, s) for a, s in sorted_aspects if s < -0.1][:2]
        
        # Voice verdict
        voice_verdict = generate_enhanced_voice_verdict(score, pros, cons, category)
        
        # Recommendations
        recommendations = []
        if include_recommendations and RECOMMENDATIONS_AVAILABLE:
            try:
                recommendations = get_product_recommendations(
                    product_url, product_title, product_description, limit=3
                )
            except Exception as e:
                print(f"API recommendation error: {e}")
        
        processing_time = time.time() - start_time
        
        response_data = {
            'ok': True,
            'score': round(score),
            'recommendation': get_recommendation_text(score),
            'pros': pros,
            'cons': cons,
            'voice_verdict': voice_verdict,
            'product_title': product_title,
            'product_url': product_url,
            'category': category,
            'reviews_analyzed': len(reviews),
            'processing_time': round(processing_time, 2),
            'recommendations': recommendations,
            'meta': {
                'confidence': analysis_results.get('meta', {}).get('confidence', 0.8),
                'data_quality': analysis_results.get('meta', {}).get('avg_quality', 0.8),
                'enhanced_features': ENHANCED_MODULES
            }
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f"API error: {str(e)}")
        return jsonify(ok=False, error=f"Analysis failed: {str(e)}"), 500

@app.route('/api/extension/health', methods=['GET', 'OPTIONS'])
def api_extension_health():
    """Enhanced health check"""
    if request.method == 'OPTIONS':
        return jsonify(ok=True)
    
    return jsonify({
        'ok': True,
        'status': 'healthy',
        'version': '2.0.0',
        'features': {
            'enhanced_analysis': ENHANCED_MODULES,
            'recommendations': RECOMMENDATIONS_AVAILABLE,
            'voice_verdict': True,
            'category_detection': ENHANCED_MODULES,
            'multi_factor_scoring': ENHANCED_MODULES
        },
        'timestamp': datetime.now().isoformat()
    })

def get_recommendation_text(score):
    """Get recommendation text based on score"""
    if score >= 75:
        return 'Highly Recommended'
    elif score >= 60:
        return 'Recommended'
    elif score >= 40:
        return 'Acceptable'
    else:
        return 'Not Recommended'

if __name__ == '__main__':
    print("Starting Enhanced Shopper's Verdict...")
    print(f"Enhanced modules: {'Available' if ENHANCED_MODULES else 'Limited'}")
    print(f"Recommendations: {'Available' if RECOMMENDATIONS_AVAILABLE else 'Limited'}")
    print("Server will be available at: http://localhost:5000")
    
    app.run(debug=True, host='localhost', port=5000)