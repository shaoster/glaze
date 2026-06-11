/**
 * Direct-to-R2 upload integration for Django admin image fields.
 *
 * Wires up every button rendered by R2ImageWidget. Clicking "Upload Image"
 * opens a hidden file input; on selection the script requests a presigned PUT
 * URL from /api/uploads/r2/presigned-url/ (session cookie + CSRF token),
 * uploads the file straight to R2, and writes the resulting public URL into
 * the associated text input. The field value is a bare URL string.
 *
 * Clicking a preview thumbnail opens a viewport-constrained lightbox with the
 * full-size original.
 */
(function () {
  'use strict';

  function getCsrfToken() {
    return (document.cookie.split(';')
      .map(function (c) { return c.trim(); })
      .filter(function (c) { return c.startsWith('potterdoc_csrftoken='); })
      .map(function (c) { return c.substring('potterdoc_csrftoken='.length); })[0] || '');
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

  function fetchPresignedUrl(contentType) {
    return fetch('/api/uploads/r2/presigned-url/', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrfToken(),
      },
      body: JSON.stringify({ content_type: contentType, resource_type: 'image' }),
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.detail || ('Presign failed with status ' + r.status));
        });
      }
      return r.json();
    });
  }

  function uploadFile(file, inp, preview, clearBtn, btn) {
    var originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Uploading…';

    fetchPresignedUrl(file.type)
      .then(function (presign) {
        return fetch(presign.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        }).then(function (r) {
          if (!r.ok) { throw new Error('Upload failed with status ' + r.status); }
          return presign.public_url;
        });
      })
      .then(function (publicUrl) {
        inp.value = publicUrl;
        if (preview) {
          preview.src = publicUrl;
          preview.dataset.fullUrl = publicUrl;
          preview.style.display = 'block';
        }
        if (clearBtn) { clearBtn.style.display = 'inline-block'; }
      })
      .catch(function (err) {
        alert('Image upload failed: ' + err.message);
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = originalLabel;
      });
  }

  function initUploadBtn(btn) {
    var inp = document.getElementById(btn.dataset.inputId);
    var preview = document.getElementById(btn.dataset.previewId);
    var fileInput = document.getElementById(btn.dataset.fileId);
    if (!inp || !fileInput) { return; }

    var clearBtn = document.querySelector(
      '.r2-clear-btn[data-input-id="' + btn.dataset.inputId + '"]'
    );

    btn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) { return; }
      uploadFile(file, inp, preview, clearBtn, btn);
      fileInput.value = '';
    });
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
    document.querySelectorAll('.r2-image-preview').forEach(function (img) {
      img.addEventListener('click', function () {
        var url = this.dataset.fullUrl;
        if (url) { openLightbox(url); }
      });
    });

    document.querySelectorAll('.r2-upload-btn').forEach(initUploadBtn);
    document.querySelectorAll('.r2-clear-btn').forEach(initClearBtn);
  });
})();
