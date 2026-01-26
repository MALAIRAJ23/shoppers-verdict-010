import re
import statistics
from collections import defaultdict, Counter
from datetime import datetime
import math

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    VADER_AVAILABLE = True
except ImportError:
    VADER_AVAILABLE = False
    print("VADER not available, using basic sentiment analysis")

class EnhancedAnalyzer:
    def __init__(self):
        self.vader = SentimentIntensityAnalyzer() if VADER_AVAILABLE else None
        
        # Category-specific aspects to look for
        self.category_aspects = {
            'smartphone': {
                'camera': ['camera', 'photo', 'picture', 'video', 'lens', 'zoom', 'selfie'],
                'battery': ['battery', 'charge', 'charging', 'power', 'backup'],
                'performance': ['performance', 'speed', 'fast', 'slow', 'lag', 'smooth', 'processor'],
                'display': ['display', 'screen', 'brightness', 'color', 'resolution'],
                'design': ['design', 'build', 'quality', 'premium', 'plastic', 'metal'],
                'software': ['software', 'ui', 'interface', 'update', 'android', 'ios'],
                'audio': ['sound', 'audio', 'speaker', 'music', 'call', 'volume']
            },
            'laptop': {
                'performance': ['performance', 'speed', 'processor', 'cpu', 'ram', 'fast', 'slow'],
                'battery': ['battery', 'backup', 'charge', 'power', 'hours'],
                'keyboard': ['keyboard', 'typing', 'keys', 'trackpad', 'touchpad'],
                'display': ['display', 'screen', 'brightness', 'color', 'resolution'],
                'build': ['build', 'quality', 'construction', 'durability', 'solid'],
                'portability': ['weight', 'portable', 'carry', 'travel', 'size'],
                'cooling': ['heat', 'temperature', 'cooling', 'fan', 'thermal']
            },
            'tv': {
                'picture': ['picture', 'image', 'color', 'brightness', 'contrast', 'clarity'],
                'sound': ['sound', 'audio', 'speaker', 'volume', 'bass'],
                'smart_features': ['smart', 'apps', 'interface', 'remote', 'wifi'],
                'design': ['design', 'look', 'appearance', 'stand', 'mounting'],
                'size': ['size', 'screen', 'inch', 'big', 'small'],
                'value': ['price', 'value', 'money', 'worth', 'expensive', 'cheap']
            },
            'general': {
                'quality': ['quality', 'build', 'construction', 'material'],
                'performance': ['performance', 'speed', 'fast', 'slow', 'work'],
                'design': ['design', 'look', 'appearance', 'style'],
                'value': ['price', 'value', 'money', 'worth', 'cost'],
                'durability': ['durable', 'lasting', 'break', 'fragile', 'solid']
            }
        }
        
        # Sentiment modifiers
        self.positive_words = [
            'excellent', 'amazing', 'fantastic', 'great', 'good', 'love', 'perfect',
            'awesome', 'outstanding', 'superb', 'wonderful', 'impressive', 'satisfied',
            'happy', 'pleased', 'recommend', 'best', 'brilliant', 'solid', 'smooth'
        ]
        
        self.negative_words = [
            'terrible', 'awful', 'bad', 'poor', 'hate', 'worst', 'horrible',
            'disappointing', 'useless', 'broken', 'defective', 'cheap', 'flimsy',
            'slow', 'lag', 'problem', 'issue', 'fail', 'waste', 'regret'
        ]

    def basic_sentiment(self, text):
        """Basic sentiment analysis fallback"""
        text_lower = text.lower()
        
        positive_count = sum(1 for word in self.positive_words if word in text_lower)
        negative_count = sum(1 for word in self.negative_words if word in text_lower)
        
        if positive_count > negative_count:
            return 0.5 + (positive_count - negative_count) * 0.1
        elif negative_count > positive_count:
            return -0.5 - (negative_count - positive_count) * 0.1
        else:
            return 0.0

    def get_sentiment_score(self, text):
        """Get sentiment score using available methods"""
        if self.vader:
            scores = self.vader.polarity_scores(text)
            return scores['compound']
        else:
            return self.basic_sentiment(text)

    def extract_aspects_and_sentiments(self, reviews, category='general'):
        """Extract aspects and their sentiments from reviews"""
        
        aspects = self.category_aspects.get(category, self.category_aspects['general'])
        aspect_sentiments = defaultdict(list)
        aspect_examples = defaultdict(list)
        
        for review in reviews:
            if not review or len(review.strip()) < 10:
                continue
                
            review_lower = review.lower()
            sentences = re.split(r'[.!?]+', review)
            
            for sentence in sentences:
                if len(sentence.strip()) < 5:
                    continue
                    
                sentence_lower = sentence.lower()
                sentence_sentiment = self.get_sentiment_score(sentence)
                
                # Check which aspects are mentioned in this sentence
                for aspect_name, keywords in aspects.items():
                    if any(keyword in sentence_lower for keyword in keywords):
                        aspect_sentiments[aspect_name].append(sentence_sentiment)
                        
                        # Store example if sentiment is strong
                        if abs(sentence_sentiment) > 0.3 and len(aspect_examples[aspect_name]) < 3:
                            aspect_examples[aspect_name].append(sentence.strip())
        
        # Calculate average sentiment for each aspect
        final_aspects = {}
        for aspect, sentiments in aspect_sentiments.items():
            if sentiments:
                # Weight recent sentiments more and remove outliers
                sentiments = sorted(sentiments)
                if len(sentiments) > 2:
                    # Remove extreme outliers
                    sentiments = sentiments[1:-1]
                
                final_aspects[aspect] = statistics.mean(sentiments)
        
        return final_aspects, dict(aspect_examples)

    def calculate_review_authenticity_score(self, reviews):
        """Calculate authenticity score based on review patterns"""
        if not reviews or len(reviews) < 3:
            return 0.5
        
        authenticity_factors = []
        
        # Length diversity
        lengths = [len(review) for review in reviews]
        length_std = statistics.stdev(lengths) if len(lengths) > 1 else 0
        length_factor = min(length_std / 100, 1.0)  # Normalize
        authenticity_factors.append(length_factor)
        
        # Vocabulary diversity
        all_words = []
        for review in reviews:
            words = re.findall(r'\b\w+\b', review.lower())
            all_words.extend(words)
        
        unique_ratio = len(set(all_words)) / len(all_words) if all_words else 0
        authenticity_factors.append(unique_ratio)
        
        # Sentiment diversity
        sentiments = [self.get_sentiment_score(review) for review in reviews]
        sentiment_std = statistics.stdev(sentiments) if len(sentiments) > 1 else 0
        sentiment_factor = min(sentiment_std, 1.0)
        authenticity_factors.append(sentiment_factor)
        
        return statistics.mean(authenticity_factors)

    def calculate_enhanced_score(self, reviews, aspects, category='general', price_data=None):
        """Calculate enhanced worth-to-buy score with multiple factors"""
        
        if not reviews:
            return 50.0
        
        # 1. Basic sentiment analysis
        overall_sentiments = [self.get_sentiment_score(review) for review in reviews]
        avg_sentiment = statistics.mean(overall_sentiments)
        sentiment_score = (avg_sentiment + 1) / 2  # Normalize to 0-1
        
        # 2. Aspect-based scoring
        aspect_score = 0.5  # Default neutral
        if aspects:
            aspect_values = list(aspects.values())
            avg_aspect_sentiment = statistics.mean(aspect_values)
            aspect_score = (avg_aspect_sentiment + 1) / 2
            
            # Bonus for having many aspects covered
            aspect_coverage_bonus = min(len(aspects) / 7, 1.0) * 0.05
            aspect_score += aspect_coverage_bonus
            
            # Penalty for strongly negative aspects
            negative_aspects = sum(1 for score in aspect_values if score < -0.3)
            negative_penalty = negative_aspects * 0.08
            aspect_score -= negative_penalty
        
        # 3. Review quality and authenticity
        authenticity_score = self.calculate_review_authenticity_score(reviews)
        
        # 4. Data quality factor
        review_count = len(reviews)
        data_quality = min(review_count / 20, 1.0)  # Max quality at 20+ reviews
        
        # 5. Category-specific adjustments
        category_weight = 1.0
        if category in ['smartphone', 'laptop']:
            # Tech products - weight performance and quality higher
            if 'performance' in aspects and aspects['performance'] > 0.2:
                category_weight += 0.05
            if 'quality' in aspects and aspects['quality'] > 0.2:
                category_weight += 0.05
        
        # 6. Combine all factors
        final_score = (
            sentiment_score * 0.35 +
            aspect_score * 0.35 +
            authenticity_score * 0.15 +
            data_quality * 0.15
        ) * category_weight
        
        # Ensure score is between 0 and 1
        final_score = max(0, min(1, final_score))
        
        return final_score * 100  # Convert to 0-100 scale

    def generate_insights(self, reviews, aspects, score, category='general'):
        """Generate human-readable insights"""
        
        insights = []
        
        # Overall assessment
        if score >= 75:
            insights.append("This product receives strong positive feedback from customers.")
        elif score >= 60:
            insights.append("This product has generally positive reviews with some mixed feedback.")
        elif score >= 40:
            insights.append("This product receives mixed reviews with notable concerns.")
        else:
            insights.append("This product has significant negative feedback from customers.")
        
        # Top strengths
        if aspects:
            top_aspects = sorted(aspects.items(), key=lambda x: x[1], reverse=True)[:2]
            strengths = [aspect for aspect, score in top_aspects if score > 0.1]
            if strengths:
                insights.append(f"Customers particularly appreciate the {' and '.join(strengths)}.")
        
        # Main concerns
        if aspects:
            bottom_aspects = sorted(aspects.items(), key=lambda x: x[1])[:2]
            concerns = [aspect for aspect, score in bottom_aspects if score < -0.1]
            if concerns:
                insights.append(f"Common concerns include the {' and '.join(concerns)}.")
        
        # Review quality note
        review_count = len(reviews)
        if review_count >= 20:
            insights.append(f"Analysis based on {review_count} customer reviews provides high confidence.")
        elif review_count >= 10:
            insights.append(f"Analysis based on {review_count} reviews provides good confidence.")
        else:
            insights.append(f"Limited to {review_count} reviews - consider checking more sources.")
        
        return " ".join(insights)

def perform_analysis(reviews, category='general', price_data=None):
    """Main analysis function with enhanced capabilities"""
    
    if not reviews:
        return {
            'overall_sentiment': {'positive': 0, 'negative': 0, 'neutral': 1},
            'aspect_sentiments': {},
            'aspect_support': {},
            'meta': {
                'reviews_used': 0,
                'sentences': 0,
                'confidence': 0.0,
                'category': category
            }
        }
    
    analyzer = EnhancedAnalyzer()
    
    # Filter and clean reviews
    clean_reviews = [r for r in reviews if r and len(r.strip()) > 10]
    
    # Extract aspects and sentiments
    aspects, aspect_examples = analyzer.extract_aspects_and_sentiments(clean_reviews, category)
    
    # Calculate overall sentiment distribution
    overall_sentiments = []
    sentence_count = 0
    
    for review in clean_reviews:
        sentiment = analyzer.get_sentiment_score(review)
        overall_sentiments.append(sentiment)
        sentence_count += len(re.split(r'[.!?]+', review))
    
    # Categorize sentiments
    positive_count = sum(1 for s in overall_sentiments if s > 0.1)
    negative_count = sum(1 for s in overall_sentiments if s < -0.1)
    neutral_count = len(overall_sentiments) - positive_count - negative_count
    
    # Calculate confidence based on data quality
    confidence = min(len(clean_reviews) / 15, 1.0)  # Max confidence at 15+ reviews
    
    return {
        'overall_sentiment': {
            'positive': positive_count,
            'negative': negative_count,
            'neutral': neutral_count
        },
        'aspect_sentiments': aspects,
        'aspect_support': aspect_examples,
        'meta': {
            'reviews_used': len(clean_reviews),
            'sentences': sentence_count,
            'confidence': confidence,
            'category': category,
            'avg_quality': analyzer.calculate_review_authenticity_score(clean_reviews)
        }
    }

def analyze_product_description(description, category='general'):
    """Analyze product description for additional insights"""
    
    if not description:
        return {'usability_score': 0.5, 'key_features': [], 'concerns': []}
    
    description_lower = description.lower()
    
    # Feature keywords by category
    feature_keywords = {
        'smartphone': ['camera', 'battery', 'display', 'processor', 'storage', 'ram'],
        'laptop': ['processor', 'ram', 'storage', 'graphics', 'display', 'battery'],
        'tv': ['4k', 'hdr', 'smart', 'wifi', 'bluetooth', 'apps'],
        'general': ['quality', 'durable', 'premium', 'advanced', 'efficient']
    }
    
    keywords = feature_keywords.get(category, feature_keywords['general'])
    
    # Count mentioned features
    mentioned_features = [kw for kw in keywords if kw in description_lower]
    
    # Calculate usability score based on description completeness
    usability_score = min(len(mentioned_features) / len(keywords), 1.0)
    
    # Look for quality indicators
    quality_words = ['premium', 'high-quality', 'advanced', 'professional', 'certified']
    quality_mentions = sum(1 for word in quality_words if word in description_lower)
    
    if quality_mentions > 0:
        usability_score += 0.1
    
    return {
        'usability_score': usability_score,
        'key_features': mentioned_features,
        'feature_completeness': len(mentioned_features) / len(keywords)
    }