// פרסר NDJSON אינקרמנטלי: צ'אנקים מגיעים חתוכים באמצע שורה, צוברים buffer ופולטים שורות שלמות.
// שורה שאינה JSON תקין נזרקת בשקט: זרם חלקי עדיף על מסך שנתקע על צ'אנק פגום
export class NdjsonParser<T> {
  private buffer = "";

  push(chunk: string): T[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    return parseLines<T>(lines);
  }

  flush(): T[] {
    const rest = this.buffer;
    this.buffer = "";
    return parseLines<T>([rest]);
  }
}

function parseLines<T>(lines: string[]): T[] {
  const out: T[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // שורה פגומה, מדלגים
    }
  }
  return out;
}
