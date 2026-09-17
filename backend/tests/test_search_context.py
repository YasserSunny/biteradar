"""Cache identity, migration, and history compatibility for discovery."""
import json
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import models
from database import get_db, run_database_migrations
from main import app
from routers.search import search_context_and_key
from schemas import SearchRequest

@pytest.fixture
def context_client():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = lambda: session
    yield TestClient(app), session
    if previous:
        app.dependency_overrides[get_db] = previous
    else:
        app.dependency_overrides.pop(get_db, None)
    session.close()
    engine.dispose()

def seed(session, payload, legacy=False):
    context, key = search_context_and_key(SearchRequest(**payload))
    query = models.SearchQuery(dish_name=payload['dish_name'], location=payload['location'], cache_key=None if legacy else key, search_context=None if legacy else json.dumps(context))
    session.add(query)
    session.flush()
    session.add(models.Recommendation(query_id=query.id, place_id='one', name='Noodle House', rating=4.7, total_reviews=200, reason='Rich broth', lat=40.7, lng=-74, dietary_tags='["Vegan"]', dish_price='~$15', photo_url='/photo'))
    session.add(models.SearchHistory(user_id='diner', query_id=query.id))
    session.commit()
    return query

def test_normalization_ignores_user_and_diet_order():
    a = SearchRequest(dish_name=' Ramen ', location=' New York ', user_id='a', dietary_filters=['Vegan', 'Halal'])
    b = SearchRequest(dish_name='ramen', location='new york', user_id='b', dietary_filters=['halal', 'vegan', 'Vegan'])
    assert search_context_and_key(a)[1] == search_context_and_key(b)[1]

@pytest.mark.parametrize('change', [{'dietary_filters': ['Vegan']}, {'price_tier': '$$'}, {'max_distance_km': 1.6}, {'lat': 40.7, 'lng': -74}, {'location': 'Boston'}, {'dish_name': 'Pho'}])
def test_different_context_does_not_reuse_cache(context_client, change):
    client, session = context_client
    original = {'dish_name': 'Ramen', 'location': 'New York'}
    seed(session, original)
    with patch('routers.search.gmaps', None):
        response = client.post('/api/search', json={**original, **change})
    assert response.status_code == 503

def test_legacy_history_survives_but_is_not_reused(context_client):
    client, session = context_client
    payload = {'dish_name': 'Ramen', 'location': 'New York'}
    query = seed(session, payload, legacy=True)
    with patch('routers.search.gmaps', None):
        assert client.post('/api/search', json=payload).status_code == 503
    assert client.get('/api/history/diner').json()[0]['search_context'] is None
    assert client.get(f'/api/queries/{query.id}/recommendations').json()[0]['name'] == 'Noodle House'

def test_cache_history_and_response_fields(context_client):
    client, session = context_client
    payload = {'dish_name': 'Ramen', 'location': 'New York', 'price_tier': '$$', 'lat': 40.7, 'lng': -74, 'dietary_filters': ['Vegan'], 'max_distance_km': 8}
    query = seed(session, payload)
    with patch('routers.search.gmaps', None):
        response = client.post('/api/search', json=payload)
    assert response.status_code == 200
    assert response.json() == client.get(f'/api/queries/{query.id}/recommendations').json()
    history = client.get('/api/history/diner').json()[0]['search_context']
    assert history['price_tier'] == '$$'
    assert history['lat'] == 40.7
    assert history['dietary_filters'] == ['vegan']
    assert search_context_and_key(SearchRequest(**payload))[1] != search_context_and_key(SearchRequest(**{**payload, 'lat': 41}))[1]

def test_migration_preserves_legacy_rows_and_is_idempotent():
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE search_queries (id INTEGER PRIMARY KEY, dish_name VARCHAR, location VARCHAR)'))
        connection.execute(text("INSERT INTO search_queries VALUES (1, 'Ramen', 'New York')"))
    run_database_migrations(engine)
    run_database_migrations(engine)
    assert {'cache_key', 'search_context'} <= {col['name'] for col in inspect(engine).get_columns('search_queries')}
    assert 'ix_search_queries_cache_key' in {index['name'] for index in inspect(engine).get_indexes('search_queries')}
    with engine.connect() as connection:
        assert connection.execute(text('SELECT dish_name, cache_key FROM search_queries WHERE id=1')).one() == ('Ramen', None)
    engine.dispose()
