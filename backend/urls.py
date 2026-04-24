from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse, HttpResponseNotFound
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

_INDEX_HTML = settings.BASE_DIR / 'web' / 'dist' / 'index.html'


def _spa(request, *args, **kwargs):
    if _INDEX_HTML.exists():
        return HttpResponse(_INDEX_HTML.read_bytes(), content_type='text/html')
    return HttpResponseNotFound('Frontend not built.')


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger'),
    # Catch-all: serve the React SPA for any non-API route so client-side
    # routing works on hard refresh or direct URL navigation.
    re_path(r'^(?!api/|admin/|static/).*$', _spa),
]
