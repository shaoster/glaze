import { describe, it, expect, vi } from 'vitest';
import { detectOcrRegion, autoDetectOcrRegionForRecord } from '../glazeImportTool/glazeImportToolProcessing';

describe('glazeImportToolProcessing', () => {
  it('detectOcrRegion handles canvas context failure fallback', async () => {
    const mockImage = {
        width: 1000,
        height: 1000,
    } as HTMLImageElement;
    const mockCrop = { x: 0, y: 0, size: 100 };
    
    // Mock getContext to return null to trigger the fallback path
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    
    const result = await detectOcrRegion(mockImage, mockCrop);
    
    expect(result).toBeDefined();
    expect(getContextSpy).toHaveBeenCalled();
    
    getContextSpy.mockRestore();
  });

  it('autoDetectOcrRegionForRecord throws error if record is not cropped', async () => {
    const record = { crop: null } as any;
    await expect(autoDetectOcrRegionForRecord(record)).rejects.toThrow("Record is not cropped yet.");
  });
});
