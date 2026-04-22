import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse

from api.admin import PieceResource, PieceStateResource
from api.models import Piece, PieceState


@pytest.mark.django_db
class TestAdminExports:
    def test_piece_and_piece_state_changelists_show_export_button(self):
        admin_user = get_user_model().objects.create_superuser(
            username='admin',
            email='admin@example.com',
            password='password123',
        )
        client = Client()
        client.force_login(admin_user)

        piece_response = client.get(reverse('admin:api_piece_changelist'))
        state_response = client.get(reverse('admin:api_piecestate_changelist'))

        assert piece_response.status_code == 200
        assert state_response.status_code == 200
        assert 'export/' in piece_response.content.decode()
        assert 'export/' in state_response.content.decode()

    def test_piece_and_piece_state_resources_export_associated_data(self, user):
        piece = Piece.objects.create(user=user, name='Moon Jar')
        PieceState.objects.create(
            piece=piece,
            user=user,
            state='designed',
            notes='Initial sketch',
            images=[{'url': 'https://example.com/sketch.jpg', 'caption': 'Sketch'}],
            additional_fields={},
        )
        PieceState.objects.create(
            piece=piece,
            user=user,
            state='handbuilt',
            notes='Built by hand',
            images=[],
            additional_fields={},
        )

        piece_dataset = PieceResource().export(Piece.objects.filter(pk=piece.pk))
        state_dataset = PieceStateResource().export(PieceState.objects.filter(piece=piece))

        assert piece_dataset.headers[:7] == [
            'id',
            'user__email',
            'user__username',
            'name',
            'current_state',
            'current_location',
            'state_count',
        ]
        assert piece_dataset.dict[0]['name'] == 'Moon Jar'
        assert piece_dataset.dict[0]['current_state'] == 'handbuilt'
        assert piece_dataset.dict[0]['state_count'] == 2
        exported_history = piece_dataset.dict[0]['history']
        assert [row['state'] for row in exported_history] == ['designed', 'handbuilt']
        assert exported_history[0]['notes'] == 'Initial sketch'
        assert exported_history[1]['notes'] == 'Built by hand'

        assert state_dataset.headers[:4] == [
            'id',
            'piece_id',
            'piece_name',
            'piece_workflow_version',
        ]
        assert [row['state'] for row in state_dataset.dict] == ['designed', 'handbuilt']
        assert all(row['piece_name'] == 'Moon Jar' for row in state_dataset.dict)
        assert all(row['piece_id'] == str(piece.id) for row in state_dataset.dict)

    def test_piece_resource_yaml_export_includes_plain_history(self, user):
        piece = Piece.objects.create(user=user, name='Moon Jar')
        PieceState.objects.create(piece=piece, user=user, state='designed', notes='', images=[], additional_fields={})
        PieceState.objects.create(piece=piece, user=user, state='handbuilt', notes='', images=[], additional_fields={})

        dataset = PieceResource().export(Piece.objects.filter(pk=piece.pk))
        yaml_output = dataset.export('yaml')

        assert 'history:' in yaml_output
        assert 'state: designed' in yaml_output
        assert 'state: handbuilt' in yaml_output
