/**
 * Formats a byte value into a human-readable string with appropriate units.
 * Converts bytes to B, KB, MB, or GB based on the size with up to 3 decimal places.
 *
 * @param bytes - The number of bytes to format
 * @returns A formatted string with the appropriate unit (B, KB, MB, or GB)
 *
 * @example
 * ```typescript
 * sizeFormat(512) // "512 B"
 * sizeFormat(1536) // "1.5 KB"
 * sizeFormat(2097152) // "2 MB"
 * sizeFormat(1073741824) // "1 GB"
 * ```
 */
export function sizeFormat(bytes: number): string {
  if (bytes < 1024) {
    return bytes + ' B';
  } else if (bytes < 1048576) {
    return parseFloat((bytes / 1024).toFixed(3)) + ' KB';
  } else if (bytes < 1073741824) {
    return parseFloat((bytes / 1024 / 1024).toFixed(3)) + ' MB';
  } else {
    return parseFloat((bytes / 1024 / 1024 / 1024).toFixed(3)) + ' GB';
  }
}
