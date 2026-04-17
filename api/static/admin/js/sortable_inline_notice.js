(function () {
  'use strict';

  function updateNotice(group) {
    const notice = group.querySelector('.sortable-new-row-notice');
    if (!notice) return;
    const hasNew = group.querySelector(
      '.dynamic-layers:not(.has_original)'
    ) !== null;
    notice.hidden = !hasNew;
  }

  document.addEventListener('DOMContentLoaded', function () {
    const group = document.getElementById('layers-group');
    if (!group) return;

    const notice = document.createElement('p');
    notice.className = 'help sortable-new-row-notice';
    notice.hidden = true;
    notice.textContent =
      'Save the combination first to enable drag-and-drop reordering of new layers.';
    const heading = group.querySelector('h2');
    if (heading) heading.after(notice);

    updateNotice(group);

    new MutationObserver(() => updateNotice(group)).observe(group, {
      childList: true,
      subtree: true,
    });
  });
})();
