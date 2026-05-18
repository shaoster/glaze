"""Views for CropRun — unified segmentation-inference persistence and human corrections."""

from django.shortcuts import get_object_or_404
from rest_framework import generics, mixins, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from .models import CropRun, Image, Piece, PieceStateImage
from .serializers import CropRunCreateSerializer, CropRunSerializer


class CropRunViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return CropRunCreateSerializer
        return CropRunSerializer

    def get_queryset(self):
        user = self.request.user
        assert user.is_authenticated
        qs = CropRun.objects.select_related("image", "submitter")
        if user.is_staff:
            return qs
        owned_image_ids = set(
            Piece.objects.filter(user=user).values_list("thumbnail_id", flat=True)
        ) | set(
            PieceStateImage.objects.filter(piece_state__piece__user=user).values_list(
                "image_id", flat=True
            )
        )
        return qs.filter(image_id__in=owned_image_ids)

    def perform_create(self, serializer):
        user = self.request.user
        assert user.is_authenticated
        image_id = serializer.validated_data["image_id"]
        image = get_object_or_404(Image, id=image_id)

        if not user.is_staff:
            owned = (
                Piece.objects.filter(user=user, thumbnail=image).exists()
                or PieceStateImage.objects.filter(
                    piece_state__piece__user=user, image=image
                ).exists()
            )
            if not owned:
                raise PermissionDenied(
                    "You may only submit crop runs for your own pieces."
                )

        source = {
            "type": "human",
            "backend": None,
            "deployment": "web-ui",
            "version": None,
        }
        crop = serializer.validated_data.get("crop")
        CropRun.objects.create(
            image=image,
            source=source,
            submitter=user,
            crop=crop,
            notes=serializer.validated_data.get("notes", ""),
            status=CropRun.Status.SUCCESS if crop else CropRun.Status.NO_SUBJECT,
        )


class ImageCropRunsView(generics.ListAPIView):
    serializer_class = CropRunSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        image_id = self.kwargs["image_id"]
        user = self.request.user
        assert user.is_authenticated
        qs = CropRun.objects.filter(image_id=image_id)
        if not user.is_staff:
            owned = (
                Piece.objects.filter(user=user, thumbnail_id=image_id).exists()
                or PieceStateImage.objects.filter(
                    piece_state__piece__user=user, image_id=image_id
                ).exists()
            )
            if not owned:
                return CropRun.objects.none()
        if self.request.query_params.get("latest"):
            qs = qs[:1]
        return qs
