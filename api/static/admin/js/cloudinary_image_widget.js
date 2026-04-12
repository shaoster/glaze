/**
 * Cloudinary upload widget integration for Django admin image fields.
 *
 * Attaches a Cloudinary Upload Widget to every button rendered by
 * CloudinaryImageWidget.  On successful upload the secure_url is written
 * into the associated text input and a live preview image is updated.
 *
 * Configuration (cloud_name, api_key) is read from data-attributes set by
 * the Python widget at render time.  Signatures are obtained via the
 * existing /api/uploads/cloudinary/widget-signature/ endpoint using the
 * current session cookie + CSRF token, so no additional authentication is
 * required in the admin.
 */
(function () {
  'use strict';

  function getCsrfToken() {
    return (document.cookie.split(';')
      .map(function (c) { return c.trim(); })
      .filter(function (c) { return c.startsWith('csrftoken='); })
      .map(function (c) { return c.substring('csrftoken='.length); })[0] || '');
  }

  function initWidget(btn) {
    var inputId  = btn.dataset.inputId;
    var previewId = btn.dataset.previewId;
    var inp      = document.getElementById(inputId);

    if (!inp) { return; }

    var cloudName = inp.dataset.cloudinaryCloudName;
    var apiKey    = inp.dataset.cloudinaryApiKey;

    if (!cloudName || !apiKey) { return; }

    var widget = cloudinary.createUploadWidget(
      {
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
      },
      function (error, result) {
        if (!error && result && result.event === 'success') {
          var url = result.info.secure_url;
          inp.value = url;
          var preview = document.getElementById(previewId);
          if (preview) {
            preview.src = url;
            preview.style.display = 'block';
          }
        }
      }
    );

    btn.addEventListener('click', function () { widget.open(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.cloudinary-upload-btn').forEach(initWidget);
  });
})();
