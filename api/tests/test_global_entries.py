import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from api.models import Tag


@pytest.mark.django_db
class TestTagEntrySerializer:
    def test_serializes_private_tag(self):
        from api.serializers import TagEntrySerializer

        user = User.objects.create(username='taguser@example.com', email='taguser@example.com')
        tag = Tag.objects.create(user=user, name='personal')
        data = TagEntrySerializer(tag).data
        assert data['name'] == 'personal'
        assert data['is_public'] is False
        assert isinstance(data['id'], str)

    def test_color_field_present(self):
        from api.serializers import TagEntrySerializer

        user = User.objects.create(username='coloruser@example.com', email='coloruser@example.com')
        tag = Tag.objects.create(user=user, name='teal', color='#008080')
        data = TagEntrySerializer(tag).data
        assert data['color'] == '#008080'

    def test_globals_endpoint_returns_tags_with_correct_shape(self):
        user = User.objects.create(username='tagapi@example.com', email='tagapi@example.com')
        Tag.objects.create(user=user, name='ocean', color='#0000ff')
        c = APIClient()
        c.force_authenticate(user=user)
        resp = c.get('/api/globals/tag/')
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        assert items[0]['name'] == 'ocean'
        assert items[0]['color'] == '#0000ff'
        assert items[0]['is_public'] is False
        assert isinstance(items[0]['id'], str)


@pytest.mark.django_db
class TestGlobalEntries:
    def test_piece_global_uses_registered_rich_serializer_without_glaze_hack(
        self, client, piece
    ):
        response = client.get('/api/globals/piece/')

        assert response.status_code == 200
        assert response.json() == [
            {
                'id': str(piece.id),
                'name': 'Test Bowl',
                'created': piece.created.isoformat().replace('+00:00', 'Z'),
                'last_modified': piece.last_modified.isoformat().replace(
                    '+00:00', 'Z'
                ),
                'thumbnail': None,
                'current_state': {'state': 'designed'},
                'current_location': None,
                'tags': [],
            }
        ]
