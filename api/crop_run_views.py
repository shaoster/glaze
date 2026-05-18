"""Views for CropRun — unified segmentation-inference persistence and human corrections."""

from django.shortcuts import get_object_or_404
from rest_framework import generics, mixins, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

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

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        crop_run = self.perform_create(serializer)
        output_serializer = CropRunSerializer(
            crop_run, context=self.get_serializer_context()
        )
        headers = self.get_success_headers(output_serializer.data)
        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

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
        return serializer.save(
            image=image,
            submitter=user,
            source=source,
            status=CropRun.Status.SUCCESS,
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
