export function jsonToStringForConsole(input: any): string {
  try {
    const result = JSON.stringify(input);
    return result ?? String(input);
  } catch (error) {
    // Handle circular references
    if (error instanceof TypeError && error.message.includes('circular')) {
      return '[Circular Reference]';
    }
    return String(input);
  }
}
