/**
 * Cloudinary upload widget integration for Django admin image fields.
 *
 * Attaches a Cloudinary Upload Widget to every button rendered by
 * CloudinaryImageWidget.  On successful upload an image JSON payload is written
 * into the associated text input and a live preview image is updated.
 *
 * Configuration (cloud_name, api_key, folder) is read from data-attributes set by
 * the Python widget at render time.  Signatures are obtained via the
 * existing /api/uploads/cloudinary/widget-signature/ endpoint using the
 * current session cookie + CSRF token, so no additional authentication is
 * required in the admin.
 *
 * Preview thumbnails use a Cloudinary JPG transform (f_jpg,w_200,h_200,c_fill)
 * so that .heic and other non-browser-renderable formats display correctly.
 * Clicking a thumbnail opens a viewport-constrained lightbox showing the
 * full-size JPG version.
 */
(function () {
  'use strict';

  function getCsrfToken() {
    return (document.cookie.split(';')
      .map(function (c) { return c.trim(); })
      .filter(function (c) { return c.startsWith('csrftoken='); })
      .map(function (c) { return c.substring('csrftoken='.length); })[0] || '');
  }

  /**
   * Inject a Cloudinary transformation string immediately after /image/upload/.
   * This matches what the Python SDK generates for the server-rendered preview.
   */
  function withTransform(url, transform) {
    if (!url || url.indexOf('/image/upload/') === -1) { return url; }
    return url.replace('/image/upload/', '/image/upload/' + transform + '/');
  }

  function getPreviewUrl(rawUrl) {
    return withTransform(rawUrl, 'f_jpg,w_200,h_200,c_fill');
  }

  function getLightboxUrl(rawUrl) {
    return withTransform(rawUrl, 'f_jpg');
  }

  function buildImagePayload(info, fallbackCloudName) {
    return {
      url: info.secure_url || info.url || '',
      cloudinary_public_id: info.public_id || null,
      cloud_name: info.cloud_name || fallbackCloudName || null,
    };
  }

  /** Open a full-screen lightbox showing the given image URL. */
  function openLightbox(url) {
    var overlay = document.createElement('div');
    overlay.style.cssText = (
      'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background:rgba(0,0,0,0.85);z-index:999999;' +
      'display:flex;align-items:center;justify-content:center;cursor:zoom-out;'
    );
    var img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'max-width:90vw;max-height:80vh;object-fit:contain;border-radius:4px;';
    overlay.appendChild(img);
    overlay.addEventListener('click', function () { document.body.removeChild(overlay); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        document.body.removeChild(overlay);
        document.removeEventListener('keydown', onKey);
      }
    });
    document.body.appendChild(overlay);
  }

  function initWidget(btn) {
    var inputId  = btn.dataset.inputId;
    var previewId = btn.dataset.previewId;
    var inp      = document.getElementById(inputId);

    if (!inp) { return; }

    var cloudName = inp.dataset.cloudinaryCloudName;
    var apiKey    = inp.dataset.cloudinaryApiKey;
    var folder    = inp.dataset.cloudinaryFolder || '';

    if (!cloudName || !apiKey) { return; }

    var widgetOptions = {
      cloudName: cloudName,
      apiKey: apiKey,
        uploadSignature: function (callback, paramsToSign) {
          fetch('/api/uploads/cloudinary/widget-signature/', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRFToken': getCsrfToken(),
            },
            body: JSON.stringify({ params_to_sign: paramsToSign }),
          })
            .then(function (r) { return r.json(); })
            .then(function (data) { callback(data.signature); });
        },
        sources: ['local', 'url', 'camera'],
        multiple: false,
    };
    if (folder) { widgetOptions.folder = folder; }

    var widget = cloudinary.createUploadWidget(
      widgetOptions,
      function (error, result) {
        if (!error && result && result.event === 'success') {
          var imagePayload = buildImagePayload(
            result.info,
            inp.dataset.cloudinaryCloudName
          );
          inp.value = JSON.stringify(imagePayload);
          var preview = document.getElementById(previewId);
          if (preview) {
            preview.src = getPreviewUrl(imagePayload.url);
            preview.dataset.fullUrl = getLightboxUrl(imagePayload.url);
            preview.style.display = 'block';
          }
        }
      }
    );

    btn.addEventListener('click', function () { widget.open(); });
  }

  function initClearBtn(btn) {
    btn.addEventListener('click', function () {
      if (!confirm('Are you sure you want to remove the attached image?')) { return; }
      var inp = document.getElementById(btn.dataset.inputId);
      var preview = document.getElementById(btn.dataset.previewId);
      if (inp) { inp.value = ''; }
      if (preview) { preview.style.display = 'none'; }
      btn.style.display = 'none';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.cloudinary-preview').forEach(function (img) {
      img.addEventListener('click', function () {
        var url = this.dataset.fullUrl;
        if (url) { openLightbox(url); }
      });
    });

    document.querySelectorAll('.cloudinary-upload-btn').forEach(initWidget);
    document.querySelectorAll('.cloudinary-clear-btn').forEach(initClearBtn);
  });
})();
