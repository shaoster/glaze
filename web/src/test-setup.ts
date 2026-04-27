import "@testing-library/jest-dom";
window.getComputedStyle = () => ({
  getPropertyValue: () => undefined,
});
