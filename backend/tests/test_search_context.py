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


def test_text_search_reuses_autocomplete_cache_after_resolving_location(context_client):
    client, session = context_client
    selected = {'dish_name': 'Persian Bakery', 'location': 'Marietta, GA, USA', 'lat': 33.9532531, 'lng': -84.5499358}
    query = seed(session, selected)
    with patch('routers.search.gmaps', object()), patch('routers.search.geocode_location', return_value={'lat': selected['lat'], 'lng': selected['lng']}) as geocode, patch('routers.search.search_candidate_restaurants') as providers, patch('routers.search.rank_restaurants_with_gemini') as rank:
        response = client.post('/api/search', json={'dish_name': selected['dish_name'], 'location': selected['location']})
    assert response.status_code == 200
    assert response.json()[0]['query_id'] == query.id
    geocode.assert_called_once()
    providers.assert_not_called()
    rank.assert_not_called()
    assert session.query(models.SearchQuery).count() == 1


def test_resolved_location_keeps_coordinate_cache_separation(context_client):
    client, session = context_client
    selected = {'dish_name': 'Ramen', 'location': 'New York', 'lat': 40.7, 'lng': -74}
    seed(session, selected)
    with patch('routers.search.gmaps', object()), patch('routers.search.geocode_location', return_value={'lat': 41, 'lng': -74}), patch('routers.search.search_candidate_restaurants', return_value=[]) as providers:
        response = client.post('/api/search', json={'dish_name': 'Ramen', 'location': 'New York'})
    assert response.status_code == 200
    assert response.json() == []
    providers.assert_called_once()


def test_autocomplete_reuses_text_cache_only_when_resolved_coordinates_match(context_client):
    client, session = context_client
    selected = {'dish_name': 'Ramen', 'location': 'New York', 'lat': 40.7, 'lng': -74}
    query = seed(session, selected)
    _, query.cache_key = search_context_and_key(SearchRequest(dish_name='Ramen', location='New York'))
    session.commit()
    with patch('routers.search.gmaps', None), patch('routers.search.geocode_location') as geocode, patch('routers.search.search_candidate_restaurants') as providers:
        response = client.post('/api/search', json=selected)
        different = client.post('/api/search', json={**selected, 'lat': 41})
    assert response.status_code == 200
    assert response.json()[0]['query_id'] == query.id
    assert different.status_code == 503
    providers.assert_not_called()
    geocode.assert_not_called()
