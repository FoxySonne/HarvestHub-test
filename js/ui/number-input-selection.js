(() => {
  function isZeroNumberInput(element) {
    return element instanceof HTMLInputElement
      && element.type === "number"
      && element.value === "0"
      && !element.disabled
      && !element.readOnly;
  }

  function selectZero(input) {
    if (!isZeroNumberInput(input)) return;

    window.requestAnimationFrame(() => {
      if (!isZeroNumberInput(input) || document.activeElement !== input) return;

      try {
        input.select();
      } catch {
        // Некоторые браузеры не поддерживают программное выделение в input[type="number"].
      }
    });
  }

  document.addEventListener("focusin", event => {
    selectZero(event.target);
  });

  document.addEventListener("pointerup", event => {
    if (!isZeroNumberInput(event.target)) return;
    event.preventDefault();
    selectZero(event.target);
  });
})();
