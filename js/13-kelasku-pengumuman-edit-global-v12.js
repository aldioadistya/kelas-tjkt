(function(){
  // The renderer uses inline onclick="openPengumumanModal(id)".
  // Explicitly expose the existing function without replacing its logic.
  if (typeof openPengumumanModal === 'function') {
    window.openPengumumanModal = openPengumumanModal;
  }
  if (typeof submitPengumuman === 'function') {
    window.submitPengumuman = submitPengumuman;
  }
  if (typeof deletePengumumanCurrent === 'function') {
    window.deletePengumumanCurrent = deletePengumumanCurrent;
  }
})();
