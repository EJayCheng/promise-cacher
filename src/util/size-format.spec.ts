import { sizeFormat } from './size-format';

describe('sizeFormat', () => {
  describe('Bytes (B)', () => {
    it('should format 0 bytes', () => {
      expect(sizeFormat(0)).toBe('0 B');
    });

    it('should format small byte values', () => {
      expect(sizeFormat(1)).toBe('1 B');
      expect(sizeFormat(512)).toBe('512 B');
      expect(sizeFormat(1023)).toBe('1023 B');
    });
  });

  describe('Kilobytes (KB)', () => {
    it('should format exact KB values', () => {
      expect(sizeFormat(1024)).toBe('1 KB');
      expect(sizeFormat(2048)).toBe('2 KB');
    });

    it('should format fractional KB values with up to 3 decimal places', () => {
      expect(sizeFormat(1536)).toBe('1.5 KB');
      expect(sizeFormat(1587)).toBe('1.55 KB');
      expect(sizeFormat(1588)).toBe('1.551 KB');
    });

    it('should format values just under 1 MB', () => {
      expect(sizeFormat(1048575)).toBe('1023.999 KB');
    });
  });

  describe('Megabytes (MB)', () => {
    it('should format exact MB values', () => {
      expect(sizeFormat(1048576)).toBe('1 MB'); // 1024 * 1024
      expect(sizeFormat(2097152)).toBe('2 MB'); // 2 * 1024 * 1024
    });

    it('should format fractional MB values with up to 3 decimal places', () => {
      expect(sizeFormat(1572864)).toBe('1.5 MB'); // 1.5 * 1024 * 1024
      expect(sizeFormat(1625292)).toBe('1.55 MB');
    });

    it('should format values just under 1 GB', () => {
      expect(sizeFormat(1073741823)).toBe('1024 MB');
    });
  });

  describe('Gigabytes (GB)', () => {
    it('should format exact GB values', () => {
      expect(sizeFormat(1073741824)).toBe('1 GB'); // 1024 * 1024 * 1024
      expect(sizeFormat(2147483648)).toBe('2 GB'); // 2 * 1024 * 1024 * 1024
    });

    it('should format fractional GB values with up to 3 decimal places', () => {
      expect(sizeFormat(1610612736)).toBe('1.5 GB'); // 1.5 * 1024 * 1024 * 1024
      expect(sizeFormat(1663204147)).toBe('1.549 GB');
    });

    it('should format large GB values', () => {
      expect(sizeFormat(10737418240)).toBe('10 GB'); // 10 * 1024 * 1024 * 1024
    });
  });

  describe('Edge cases', () => {
    it('should handle boundary values correctly', () => {
      // Just below each threshold
      expect(sizeFormat(1023)).toBe('1023 B');
      expect(sizeFormat(1048575)).toBe('1023.999 KB');
      expect(sizeFormat(1073741823)).toBe('1024 MB');

      // At each threshold
      expect(sizeFormat(1024)).toBe('1 KB');
      expect(sizeFormat(1048576)).toBe('1 MB');
      expect(sizeFormat(1073741824)).toBe('1 GB');
    });

    it('should remove trailing zeros from decimal values', () => {
      expect(sizeFormat(2048)).toBe('2 KB'); // Should be "2 KB", not "2.000 KB"
      expect(sizeFormat(2097152)).toBe('2 MB'); // Should be "2 MB", not "2.000 MB"
      expect(sizeFormat(2147483648)).toBe('2 GB'); // Should be "2 GB", not "2.000 GB"
    });

    it('should handle decimal precision correctly', () => {
      // Test cases where parseFloat removes unnecessary decimals
      expect(sizeFormat(1025)).toBe('1.001 KB');
      expect(sizeFormat(1049601)).toBe('1.001 MB');
      expect(sizeFormat(1074790400)).toBe('1.001 GB');
    });
  });
});
