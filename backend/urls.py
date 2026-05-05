from urllib.parse import quote

from django.conf import settings
from django.contrib import admin
from django.http import HttpRequest, HttpResponse, HttpResponseNotFound
from django.template.loader import render_to_string
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from meta.views import Meta  # type: ignore[import-untyped]

_INDEX_HTML = settings.BASE_DIR / 'web' / 'dist' / 'index.html'
_SHARE_IMAGE_SIZE = 600


class RequestMeta(Meta):
    """django-meta object that derives canonical host details from the request."""

    def get_domain(self):
        return self.request.get_host()

    def get_protocol(self):
        return self.request.scheme


def _index_html() -> str | None:
    if not _INDEX_HTML.exists():
        return None
    return _INDEX_HTML.read_text(encoding='utf-8')


def _spa(request: HttpRequest) -> HttpResponse | HttpResponseNotFound:
    index_html = _index_html()
    if index_html is not None:
        return HttpResponse(index_html, content_type='text/html')
    return HttpResponseNotFound('Frontend not built.')


def _cloudinary_share_image_url(thumbnail: dict) -> str:
    cloud_name = (thumbnail.get('cloud_name') or '').strip()
    public_id = (thumbnail.get('cloudinary_public_id') or '').strip()
    if cloud_name and public_id:
        return (
            f'https://res.cloudinary.com/{quote(cloud_name)}/image/upload/'
            f'c_fill,g_auto,h_{_SHARE_IMAGE_SIZE},q_auto,w_{_SHARE_IMAGE_SIZE},f_jpg/'
            f'{quote(public_id, safe="/")}.jpg'
        )
    return str(thumbnail.get('url') or '')


def _inject_piece_metadata(index_html: str, request: HttpRequest, piece_id) -> str:
    from api.models import Piece
    from api.workflow import get_state_friendly_name

    piece = (
        Piece.objects.prefetch_related('states')
        .filter(id=piece_id, shared=True)
        .first()
    )
    if piece is None or piece.current_state is None:
        return index_html

    state_label = get_state_friendly_name(piece.current_state.state)
    title = f'{piece.name} - {state_label}'
    description = 'Powered by PotterDoc'
    url = request.build_absolute_uri(request.path)
    thumbnail = piece.thumbnail if isinstance(piece.thumbnail, dict) else None
    image_url = _cloudinary_share_image_url(thumbnail) if thumbnail else ''
    if image_url.startswith('/'):
        image_url = request.build_absolute_uri(image_url)

    meta = RequestMeta(
        request=request,
        title=title,
        description=description,
        url=url,
        image=image_url,
        image_width=_SHARE_IMAGE_SIZE if image_url else None,
        image_height=_SHARE_IMAGE_SIZE if image_url else None,
        object_type='article',
        site_name='PotterDoc',
        twitter_type='summary_large_image',
        use_og=True,
        use_twitter=True,
        use_title_tag=True,
    )
    tags = render_to_string('meta/meta.html', {'meta': meta}).strip()
    index_html = index_html.replace('<title>PotterDoc</title>', tags, 1)
    return index_html


def _piece_spa(request: HttpRequest, piece_id) -> HttpResponse | HttpResponseNotFound:
    index_html = _index_html()
    if index_html is None:
        return HttpResponseNotFound('Frontend not built.')
    return HttpResponse(
        _inject_piece_metadata(index_html, request, piece_id),
        content_type='text/html',
    )


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger'),
    path('pieces/<uuid:piece_id>', _piece_spa),
    # Catch-all: serve the React SPA for any non-API route so client-side
    # routing works on hard refresh or direct URL navigation.
    re_path(r'^(?!api/|admin/|static/).*$', _spa),
]
