// @ts-nocheck
import "@testing-library/jest-dom";
window.getComputedStyle = () => ({
  getPropertyValue: () => "mocked",
});
