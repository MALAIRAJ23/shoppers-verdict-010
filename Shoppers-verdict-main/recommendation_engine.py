"""
Smart Recommendation Engine for Shopper's Verdict
Provides product recommendations based on similarity analysis and better scores
"""

import sqlite3
import json
import re
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.decomposition import TruncatedSVD

# Local imports
from scraper import scrape_data
from analyzer import perform_analysis

# Configuration
RECOMMENDATIONS_DB = 'recommendations.db'
CACHE_EXPIRY_DAYS = 3
MAX_COMPETITORS_PER_SITE = 10
SIMILARITY_THRESHOLD = 0.1
MIN_SCORE_IMPROVEMENT = 5  # Minimum score improvement to recommend

class RecommendationEngine:
    def __init__(self):
        # Optional spaCy NLP - gracefully handled if unavailable
        self.nlp = None
        try:
            import spacy
            self.nlp = spacy.load("en_core_web_sm")
        except:
            print("spaCy NLP model not available - using TF-IDF only")
        
        self.vectorizer = TfidfVectorizer(
            max_features=1000,
            stop_words='english',
            ngram_range=(1, 2),
            min_df=2
        )
        self.svd = TruncatedSVD(n_components=100, random_state=42)
        self.init_db()
    
    def init_db(self):
        """Initialize recommendation database."""
        try:
            with sqlite3.connect(RECOMMENDATIONS_DB) as conn:
                cursor = conn.cursor()
                
                # Products table for storing analyzed products
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS products (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        url TEXT UNIQUE NOT NULL,
                        title TEXT,
                        description TEXT,
                        price REAL,
                        score INTEGER,
                        pros TEXT,
                        cons TEXT,
                        category TEXT,
                        site TEXT,
                        embedding TEXT,
                        timestamp DATETIME NOT NULL,
                        analysis_data TEXT
                    )
                ''')
                
                # Competitors table for related products
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS competitors (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        base_url TEXT NOT NULL,
                        competitor_url TEXT NOT NULL,
                        similarity_score REAL,
                        timestamp DATETIME NOT NULL,
                        UNIQUE(base_url, competitor_url)
                    )
                ''')
                
                # Recommendations cache
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS recommendations_cache (
                        base_url TEXT PRIMARY KEY,
                        recommendations TEXT NOT NULL,
                        timestamp DATETIME NOT NULL
                    )
                ''')
                
                conn.commit()
                print("Recommendation database initialized successfully.")
        except sqlite3.Error as e:
            print(f"Database initialization error: {e}")
    
    def extract_product_features(self, title: str, description: str) -> str:
        """Extract key features from product title and description."""
        # Combine title and description
        text = f"{title} {description}"
        
        # Clean and normalize text
        text = re.sub(r'[^\w\s-]', ' ', text.lower())
        text = re.sub(r'\s+', ' ', text.strip())
        
        # Extract key terms using spaCy if available
        if self.nlp:
            try:
                doc = self.nlp(text)
                # Extract nouns, adjectives, and important entities
                features = []
                
                # Add noun phrases
                for chunk in doc.noun_chunks:
                    if len(chunk.text.split()) <= 3:  # Limit phrase length
                        features.append(chunk.text.lower().strip())
                
                # Add adjectives + nouns
                tokens = [t for t in doc if not t.is_space and not t.is_punct]
                for i in range(len(tokens) - 1):
                    if tokens[i].pos_ == 'ADJ' and tokens[i+1].pos_ == 'NOUN':
                        features.append(f"{tokens[i].text} {tokens[i+1].text}".lower())
                
                # Add entities
                for ent in doc.ents:
                    if ent.label_ in ['PRODUCT', 'ORG', 'MONEY']:
                        features.append(ent.text.lower().strip())
                
                if features:
                    return ' '.join(features[:50])  # Limit features
            except Exception:
                pass
        
        # Fallback: simple keyword extraction
        words = text.split()
        # Remove common stop words
        stop_words = {'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must'}
        features = [w for w in words if len(w) > 2 and w not in stop_words]
        
        return ' '.join(features[:100])  # Limit to first 100 relevant words
    
    def get_product_category(self, title: str, description: str) -> str:
        """Infer product category from title and description."""
        text = f"{title} {description}".lower()
        
        # Category mappings
        categories = {
            'electronics': ['phone', 'mobile', 'smartphone', 'laptop', 'computer', 'tablet', 'headphone', 'speaker', 'camera', 'tv', 'monitor', 'mouse', 'keyboard', 'charger', 'electronics'],
            'clothing': ['shirt', 'jeans', 'dress', 'jacket', 'shoes', 'sneakers', 'clothing', 'apparel', 'fashion', 'wear', 'cotton', 'fabric'],
            'home': ['furniture', 'chair', 'table', 'bed', 'sofa', 'kitchen', 'cookware', 'home', 'decor', 'lamp', 'curtain'],
            'beauty': ['cream', 'lotion', 'shampoo', 'makeup', 'cosmetic', 'beauty', 'skincare', 'haircare'],
            'books': ['book', 'novel', 'textbook', 'author', 'edition', 'paperback', 'hardcover'],
            'sports': ['sports', 'fitness', 'gym', 'exercise', 'yoga', 'running', 'cricket', 'football'],
            'automotive': ['car', 'auto', 'vehicle', 'motorcycle', 'bike', 'automotive', 'parts'],
            'health': ['health', 'vitamin', 'supplement', 'medicine', 'medical', 'wellness']
        }
        
        for category, keywords in categories.items():
            if any(keyword in text for keyword in keywords):
                return category
        
        return 'general'
    
    def store_product(self, url: str, title: str, description: str, price: float, 
                     score: int, pros: List, cons: List, analysis_data: Dict) -> None:
        """Store analyzed product in database."""
        try:
            # Extract features and create embedding
            features = self.extract_product_features(title, description)
            category = self.get_product_category(title, description)
            site = self.get_site_from_url(url)
            
            # Create simple embedding (can be enhanced with better models)
            embedding = self.create_text_embedding(features)
            
            with sqlite3.connect(RECOMMENDATIONS_DB) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT OR REPLACE INTO products 
                    (url, title, description, price, score, pros, cons, category, site, embedding, timestamp, analysis_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    url, title, description, price, score,
                    json.dumps(pros), json.dumps(cons), category, site,
                    json.dumps(embedding.tolist() if hasattr(embedding, 'tolist') else embedding),
                    datetime.now().isoformat(),
                    json.dumps(analysis_data)
                ))
                conn.commit()
        except Exception as e:
            print(f"Error storing product: {e}")
    
    def generate_recommendation_explanation(self, product: Dict, competitor: Dict, 
                                           similarity_score: float) -> Dict:
        """Generate human-readable explanation for why product is recommended."""
        explanation = {
            'recommendation': '',
            'reasons': [],
            'score_difference': competitor.get('score', 0) - product.get('score', 0),
            'similarity': f"{similarity_score * 100:.0f}% similar",
            'key_differences': []
        }
        
        # Score comparison
        if competitor.get('score', 0) > product.get('score', 0):
            score_diff = competitor.get('score', 0) - product.get('score', 0)
            explanation['reasons'].append(
                f"Higher worth score by {score_diff} points ({competitor.get('score', 0)}/100 vs {product.get('score', 0)}/100)"
            )
        
        # Category match
        if product.get('category') == competitor.get('category'):
            explanation['reasons'].append("Same product category - direct comparison")
        
        # Pros analysis
        product_pros = set(json.loads(product.get('pros', '[]')) if isinstance(product.get('pros'), str) else product.get('pros', []))
        competitor_pros = set(json.loads(competitor.get('pros', '[]')) if isinstance(competitor.get('pros'), str) else competitor.get('pros', []))
        
        additional_pros = competitor_pros - product_pros
        if additional_pros:
            explanation['key_differences'].append({
                'type': 'additional_pros',
                'items': list(additional_pros)[:3],
                'description': f"Customers praise {', '.join(list(additional_pros)[:2])} that aren't mentioned for the original product"
            })
        
        # Cons analysis
        product_cons = set(json.loads(product.get('cons', '[]')) if isinstance(product.get('cons'), str) else product.get('cons', []))
        competitor_cons = set(json.loads(competitor.get('cons', '[]')) if isinstance(competitor.get('cons'), str) else competitor.get('cons', []))
        
        fewer_cons = product_cons - competitor_cons
        if fewer_cons:
            explanation['key_differences'].append({
                'type': 'fewer_cons',
                'items': list(fewer_cons)[:3],
                'description': f"Avoids issues like {', '.join(list(fewer_cons)[:2])} found in the original product"
            })
        
        # Price comparison
        if competitor.get('price') and product.get('price'):
            try:
                price_ratio = float(competitor.get('price', 0)) / float(product.get('price', 1))
                if price_ratio < 0.95:
                    explanation['reasons'].append(f"Better price ({price_ratio*100:.0f}% of original)")
                elif price_ratio > 1.05:
                    explanation['reasons'].append(f"Premium option ({price_ratio*100:.0f}% of original price)")
            except:
                pass
        
        # Generate summary
        if explanation['reasons']:
            explanation['recommendation'] = ' • '.join(explanation['reasons'][:2])
        else:
            explanation['recommendation'] = f"Similar product with {similarity_score*100:.0f}% matching features"
        
        return explanation
    
    def get_collaborative_recommendations(self, product_url: str) -> List[Dict]:
        """Get recommendations using collaborative filtering based on user patterns."""
        try:
            with sqlite3.connect(RECOMMENDATIONS_DB) as conn:
                cursor = conn.cursor()
                
                # Get current product
                cursor.execute('SELECT * FROM products WHERE url = ?', (product_url,))
                current = cursor.fetchone()
                
                if not current:
                    return []
                
                # Find products with similar categories and higher scores
                cursor.execute('''
                    SELECT * FROM products 
                    WHERE category = ? AND score > ? AND url != ?
                    ORDER BY score DESC
                    LIMIT 10
                ''', (current[7], current[5], product_url))  # category, score, url
                
                recommendations = []
                for rec in cursor.fetchall():
                    similarity = 0.8  # Placeholder for actual similarity calculation
                    explanation = self.generate_recommendation_explanation(
                        {
                            'score': current[5],
                            'category': current[7],
                            'pros': current[6],
                            'cons': current[7],
                            'price': current[4]
                        },
                        {
                            'score': rec[5],
                            'category': rec[7],
                            'pros': rec[6],
                            'cons': rec[7],
                            'price': rec[4]
                        },
                        similarity
                    )
                    
                    recommendations.append({
                        'url': rec[1],
                        'title': rec[2],
                        'score': rec[5],
                        'price': rec[4],
                        'explanation': explanation
                    })
                
                return recommendations
        except Exception as e:
            print(f"Error getting collaborative recommendations: {e}")
            return []
    
    def create_text_embedding(self, text: str) -> np.ndarray:
        """Create embedding for text using TF-IDF + SVD."""
        try:
            # Simple TF-IDF based embedding
            tfidf_matrix = self.vectorizer.fit_transform([text])
            
            # Reduce dimensionality if needed
            if tfidf_matrix.shape[1] > 100:
                embedding = self.svd.fit_transform(tfidf_matrix)
                return embedding[0]
            else:
                return tfidf_matrix.toarray()[0]
        except Exception:
            # Fallback: simple word frequency vector
            words = text.split()
            word_freq = defaultdict(int)
            for word in words:
                word_freq[word] += 1
            
            # Create simple vector
            vocab = sorted(word_freq.keys())[:100]  # Top 100 words
            vector = [word_freq[word] for word in vocab]
            return np.array(vector + [0] * (100 - len(vector)))  # Pad to 100 dimensions
    
    def get_site_from_url(self, url: str) -> str:
        """Extract site name from URL."""
        if 'amazon' in url.lower():
            return 'amazon'
        elif 'flipkart' in url.lower():
            return 'flipkart'
        else:
            return 'other'
    
    def find_similar_products(self, base_url: str, features: str, category: str, 
                            site: str, limit: int = 10) -> List[Dict]:
        """Find similar products from database."""
        try:
            base_embedding = self.create_text_embedding(features)
            
            with sqlite3.connect(RECOMMENDATIONS_DB) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                # Get products from same category, excluding the base product
                cursor.execute('''
                    SELECT * FROM products 
                    WHERE category = ? AND url != ? AND timestamp > ?
                    ORDER BY score DESC
                ''', (
                    category, base_url, 
                    (datetime.now() - timedelta(days=CACHE_EXPIRY_DAYS)).isoformat()
                ))
                
                similar_products = []
                for row in cursor.fetchall():
                    try:
                        # Calculate similarity
                        product_embedding = np.array(json.loads(row['embedding']))
                        similarity = self.calculate_similarity(base_embedding, product_embedding)
                        
                        if similarity > SIMILARITY_THRESHOLD:
                            similar_products.append({
                                'url': row['url'],
                                'title': row['title'],
                                'price': row['price'],
                                'score': row['score'],
                                'similarity': similarity,
                                'site': row['site'],
                                'pros': json.loads(row['pros']) if row['pros'] else [],
                                'cons': json.loads(row['cons']) if row['cons'] else []
                            })
                    except Exception as e:
                        print(f"Error processing similar product: {e}")
                        continue
                
                # Sort by similarity and score combination
                similar_products.sort(key=lambda x: (x['similarity'] * 0.3 + x['score'] * 0.7), reverse=True)
                return similar_products[:limit]
                
        except Exception as e:
            print(f"Error finding similar products: {e}")
            return []
    
    def calculate_similarity(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """Calculate cosine similarity between embeddings."""
        try:
            # Ensure same dimensions
            min_len = min(len(embedding1), len(embedding2))
            emb1 = embedding1[:min_len]
            emb2 = embedding2[:min_len]
            
            # Calculate cosine similarity
            dot_product = np.dot(emb1, emb2)
            norm1 = np.linalg.norm(emb1)
            norm2 = np.linalg.norm(emb2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            similarity = dot_product / (norm1 * norm2)
            return max(0.0, min(1.0, similarity))  # Clamp to [0, 1]
        except Exception:
            return 0.0
    
    def scrape_competitor_products(self, base_url: str, category: str, site: str, 
                                   title: str, description: str) -> List[Dict]:
        """Scrape competitor products using the competitor scraper."""
        competitors = []
        
        try:
            from competitor_scraper import get_competitor_products
            
            # Get competitor products
            competitor_products = get_competitor_products(
                base_url, title, description, max_results=10
            )
            
            # Process and analyze each competitor
            for comp in competitor_products:
                try:
                    # Quick analysis of competitor
                    comp_data = scrape_data(comp['url'])
                    if comp_data and comp_data.get('reviews'):
                        analysis = perform_analysis(comp_data['reviews'])
                        
                        # Calculate score
                        overall = analysis.get("overall_sentiment", {})
                        total_reviews = sum(overall.values())
                        
                        if total_reviews > 0:
                            positive_ratio = overall.get("positive", 0) / total_reviews
                            score = int(positive_ratio * 100)
                        else:
                            score = 50
                        
                        competitors.append({
                            'url': comp['url'],
                            'title': comp['title'],
                            'price': comp.get('price'),
                            'score': score,
                            'site': comp['site'],
                            'source': comp.get('source', 'search'),
                            'similarity': 0.8  # Default similarity for competitors
                        })
                        
                except Exception as e:
                    print(f"Error analyzing competitor {comp.get('url', '')}: {e}")
                    # Add without analysis
                    competitors.append({
                        'url': comp['url'],
                        'title': comp['title'],
                        'price': comp.get('price'),
                        'score': 60,  # Default score
                        'site': comp['site'],
                        'source': comp.get('source', 'search'),
                        'similarity': 0.6
                    })
                    continue
                    
        except Exception as e:
            print(f"Error scraping competitors: {e}")
        
        return competitors
    
    def get_cached_recommendations(self, url: str) -> Optional[List[Dict]]:
        """Get cached recommendations if available."""
        try:
            with sqlite3.connect(RECOMMENDATIONS_DB) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT recommendations, timestamp FROM recommendations_cache 
                    WHERE base_url = ?
                ''', (url,))
                
                row = cursor.fetchone()
                if row:
                    timestamp = datetime.fromisoformat(row[1])
                    if datetime.now() - timestamp < timedelta(days=CACHE_EXPIRY_DAYS):
                        return json.loads(row[0])
        except Exception as e:
            print(f"Error getting cached recommendations: {e}")
        
        return None
    
    def cache_recommendations(self, url: str, recommendations: List[Dict]) -> None:
        """Cache recommendations for future use."""
        try:
            with sqlite3.connect(RECOMMENDATIONS_DB) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT OR REPLACE INTO recommendations_cache 
                    (base_url, recommendations, timestamp) VALUES (?, ?, ?)
                ''', (url, json.dumps(recommendations), datetime.now().isoformat()))
                conn.commit()
        except Exception as e:
            print(f"Error caching recommendations: {e}")

# Global instance
recommendation_engine = RecommendationEngine()

def get_product_recommendations(product_url: str, title: str, description: str, 
                              current_score: int = None, limit: int = 5) -> List[Dict]:
    """
    Main function to get product recommendations.
    
    Args:
        product_url: URL of the current product
        title: Product title
        description: Product description
        current_score: Current product's worth-to-buy score
        limit: Maximum number of recommendations to return
    
    Returns:
        List of recommended products with better scores
    """
    try:
        # Check cache first
        cached = recommendation_engine.get_cached_recommendations(product_url)
        if cached:
            return cached[:limit]
        
        # Extract features and category
        features = recommendation_engine.extract_product_features(title, description)
        category = recommendation_engine.get_product_category(title, description)
        site = recommendation_engine.get_site_from_url(product_url)
        
        all_recommendations = []
        
        # Find similar products from database
        similar_products = recommendation_engine.find_similar_products(
            product_url, features, category, site, limit * 2
        )
        all_recommendations.extend(similar_products)
        
        # Get fresh competitor products if we don't have enough recommendations
        if len(all_recommendations) < limit:
            try:
                competitors = recommendation_engine.scrape_competitor_products(
                    product_url, category, site, title, description
                )
                all_recommendations.extend(competitors)
            except Exception as e:
                print(f"Error getting competitors: {e}")
        
        # Filter by score improvement if current score is provided
        if current_score is not None:
            all_recommendations = [
                p for p in all_recommendations 
                if p['score'] >= current_score + MIN_SCORE_IMPROVEMENT
            ]
        
        # Sort by combined score and similarity
        all_recommendations.sort(
            key=lambda x: (x['score'] * 0.7 + x.get('similarity', 0.5) * 100 * 0.3), 
            reverse=True
        )
        
        # Format recommendations
        recommendations = []
        seen_urls = set()
        
        for product in all_recommendations:
            if len(recommendations) >= limit:
                break
                
            url = product['url']
            if url not in seen_urls and url != product_url:
                seen_urls.add(url)
                recommendations.append({
                    'title': product['title'][:100],  # Truncate title
                    'url': url,
                    'price': product.get('price'),
                    'score': product['score'],
                    'similarity': round(product.get('similarity', 0.5), 3),
                    'site': product['site'],
                    'reason': f"Similar product with {product['score']}% score"
                })
        
        # Cache the results
        recommendation_engine.cache_recommendations(product_url, recommendations)
        
        return recommendations
        
    except Exception as e:
        print(f"Error getting recommendations: {e}")
        return []


