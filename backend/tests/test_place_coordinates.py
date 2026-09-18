from unittest.mock import MagicMock, patch
from googlemaps.places import PLACES_DETAIL_FIELDS
from services.places_service import fetch_place_details
from tests.test_search_context import context_client, seed


def test_place_details_uses_supported_fields():
    client = MagicMock()
    client.place.return_value = {'result': {'geometry': {'location': {'lat': 1, 'lng': 2}}}}
    with patch('services.places_service.gmaps', client):
        assert fetch_place_details('one')['geometry']['location'] == {'lat': 1, 'lng': 2}
    fields = client.place.call_args.kwargs['fields']
    assert set(fields) <= PLACES_DETAIL_FIELDS
    assert 'photo' in fields
    assert 'reviews' in fields


def test_saved_overlapping_coordinates_are_repaired(context_client):
    client, session = context_client
    query = seed(session, {'dish_name': 'Ramen', 'location': 'New York'}, legacy=True)
    import models
    session.add(models.Recommendation(query_id=query.id, place_id='two', name='Second spot', rating=4, total_reviews=10, reason='Great noodles', lat=40.7, lng=-74))
    session.commit()
    with patch('routers.search.gmaps', MagicMock()), patch('routers.search.fetch_place_details', side_effect=[{'geometry': {'location': {'lat': 40.71, 'lng': -74.01}}}, {'geometry': {'location': {'lat': 40.72, 'lng': -74.02}}}]):
        response = client.get(f'/api/queries/{query.id}/recommendations')
    assert response.status_code == 200
    assert len({(r['lat'], r['lng']) for r in response.json()}) == 2
    assert len({(r.lat, r.lng) for r in query.recommendations}) == 2
