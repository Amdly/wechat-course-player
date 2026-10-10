using System;
using System.Collections.Generic;
using System.Drawing;

// Read only the bottom-left player control. This does not require OCR or a clock.
public static class PlayerVision {
    public sealed class Control {
        public string glyph = "unknown";
        public double x, y;
    }
    private sealed class Shape {
        public int left, top, right, bottom, count;
        public readonly List<Point> points = new List<Point>();
        public int Width { get { return right - left + 1; } }
        public int Height { get { return bottom - top + 1; } }
        public double Fill { get { return (double)count / (Width * Height); } }
    }
    public static Control Read(string file, double titleY) {
        using (var bitmap = new Bitmap(file)) {
            double scale = bitmap.Width / 1450.0;
            int left = (int)(bitmap.Width * .016), right = (int)(bitmap.Width * .051);
            int top = Math.Max(0, (int)(titleY - bitmap.Width * .11));
            int bottom = Math.Min(bitmap.Height, (int)(titleY - bitmap.Width * .052));
            int width = right - left, height = bottom - top;
            if (width <= 0 || height <= 0) return new Control();
            var mask = new bool[width * height];
            var seen = new bool[mask.Length];
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
                var p = bitmap.GetPixel(left + x, top + y);
                mask[y * width + x] = p.R >= 238 && p.G >= 238 && p.B >= 238;
            }
            var shapes = new List<Shape>();
            for (int i = 0; i < mask.Length; i++) if (mask[i] && !seen[i]) {
                var shape = new Shape { left = width, top = height };
                var queue = new Queue<int>(); queue.Enqueue(i); seen[i] = true;
                while (queue.Count > 0) {
                    int p = queue.Dequeue(), x = p % width, y = p / width;
                    shape.left = Math.Min(shape.left, x); shape.right = Math.Max(shape.right, x);
                    shape.top = Math.Min(shape.top, y); shape.bottom = Math.Max(shape.bottom, y);
                    shape.count++; shape.points.Add(new Point(x, y));
                    foreach (int n in new[] { x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1 }) {
                        if (n >= 0 && mask[n] && !seen[n]) { seen[n] = true; queue.Enqueue(n); }
                    }
                }
                // Ignore video content touching the crop edge and tiny antialiasing fragments.
                if (shape.left > 0 && shape.right < width - 1 && shape.top > 0 && shape.bottom < height - 1 && shape.Height >= 18 * scale && shape.Height <= 48 * scale) shapes.Add(shape);
            }
            shapes.Sort((a, b) => a.left.CompareTo(b.left));
            for (int i = 0; i < shapes.Count; i++) for (int j = i + 1; j < shapes.Count; j++) {
                var a = shapes[i]; var b = shapes[j];
                int gap = b.left - a.right - 1;
                if (a.Fill < .88 || b.Fill < .88 || a.Width < 3 * scale || b.Width < 3 * scale || a.Width > 16 * scale || b.Width > 16 * scale) continue;
                if (a.Height < a.Width * 1.8 || b.Height < b.Width * 1.8 || Math.Abs(a.Height - b.Height) > 4 * scale || Math.Abs(a.top - b.top) > 3 * scale || gap < 3 * scale || gap > 19 * scale) continue;
                if (Math.Abs(left + (a.left + b.right) / 2.0 - bitmap.Width * .034) > 9 * scale) continue;
                return new Control { glyph = "playing", x = left + (a.left + b.right) / 2.0, y = top + (a.top + a.bottom) / 2.0 };
            }
            foreach (var shape in shapes) {
                if (shape.Width < 12 * scale || shape.Width > 32 * scale || shape.Fill < .34 || shape.Fill > .72) continue;
                int upper = 0, middle = 0, lower = 0;
                foreach (var p in shape.points) {
                    int row = p.Y - shape.top;
                    if (row == shape.Height / 4) upper++;
                    if (row == shape.Height / 2) middle++;
                    if (row == shape.Height * 3 / 4) lower++;
                }
                if (middle > shape.Width * .8 && upper > middle * .25 && upper < middle * .85 && lower > middle * .25 && lower < middle * .85) {
                    return new Control { glyph = "paused", x = left + (shape.left + shape.right) / 2.0, y = top + (shape.top + shape.bottom) / 2.0 };
                }
            }
            return new Control();
        }
    }
}
