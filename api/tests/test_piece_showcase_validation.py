import pytest
from rest_framework.exceptions import ValidationError
from api.serializers import PieceUpdateSerializer

@pytest.mark.django_db
def test_validate_showcase_fields_invalid():
    # Pass partial data to trigger validation
    serializer = PieceUpdateSerializer(data={"showcase_fields": "not-a-list"}, partial=True)
    assert not serializer.is_valid()
    assert "Must be a JSON array." in str(serializer.errors["showcase_fields"][0])

@pytest.mark.django_db
def test_validate_showcase_fields_valid():
    serializer = PieceUpdateSerializer(data={"showcase_fields": ["field1", "field2"]}, partial=True)
    assert serializer.is_valid()
