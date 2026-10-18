"""教学用 turtle 兼容层：无 GUI，把绘制指令记录为 SVG，进程结束时写出 turtle_output.svg。

支持 Turtle()、Screen()、forward/backward/right/left/goto/setpos/setx/sety、
penup/pendown/pencolor/fillcolor/begin_fill/end_fill/circle/dot/write/speed/
pensize/setheading/hideturtle/showturtle/clear/reset/home/xcor/ycor/heading/done。
"""
import math
import atexit
import os

_COLORS = {
    "black": "#000000", "white": "#ffffff", "red": "#e53935", "green": "#43a047",
    "blue": "#1e88e5", "yellow": "#fdd835", "orange": "#fb8c00", "purple": "#8e24aa",
    "pink": "#ec407a", "gray": "#9e9e9e", "grey": "#9e9e9e", "brown": "#795548",
    "cyan": "#00acc1", "magenta": "#d81b60", "gold": "#ffb300", "navy": "#1a237e",
    "skyblue": "#87ceeb", "lightgreen": "#aed581", "violet": "#ba68c8",
}


def _c(color):
    if color is None:
        return "black"
    if isinstance(color, (tuple, list)):
        rgb = [max(0, min(255, int(round(v * 255 if v <= 1 else v)))) for v in color[:3]]
        return "#%02x%02x%02x" % tuple(rgb)
    s = str(color).strip().lower().replace(" ", "")
    if s.startswith("#"):
        return s
    return _COLORS.get(s, "#333333")


class _Canvas:
    def __init__(self):
        self.items = []
        self.pen_down = True
        self.pen_color = "#1f2933"
        self.fill_color = "#ffd166"
        self.width = 2
        self.fill_stack = []
        self.min = [0.0, 0.0]
        self.max = [0.0, 0.0]
        self.bg = "#ffffff"
        self._pending = None

    def track(self, x, y):
        self.min[0] = min(self.min[0], x); self.min[1] = min(self.min[1], y)
        self.max[0] = max(self.max[0], x); self.max[1] = max(self.max[1], y)

    def line(self, x1, y1, x2, y2, color, w):
        self.track(x1, y1); self.track(x2, y2)
        self.items.append(
            '<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="%s" stroke-width="%.2f" '
            'stroke-linecap="round"/>' % (x1, y1, x2, y2, color, w)
        )

    def dot(self, x, y, r, color):
        self.track(x - r, y - r); self.track(x + r, y + r)
        self.items.append('<circle cx="%.2f" cy="%.2f" r="%.2f" fill="%s"/>' % (x, y, r, color))

    def text(self, x, y, s, color, size):
        self.track(x, y)
        esc = (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
        self.items.append(
            '<text x="%.2f" y="%.2f" fill="%s" font-size="%.1f" font-family="system-ui,sans-serif">%s</text>'
            % (x, y, color, size, esc)
        )

    def svg(self):
        pad = 40
        w = max(200.0, self.max[0] - self.min[0] + pad * 2)
        h = max(150.0, self.max[1] - self.min[1] + pad * 2)
        ox = pad - self.min[0]
        oy = pad - self.min[1]
        body = "".join(self.items)
        return (
            '<svg xmlns="http://www.w3.org/2000/svg" width="%.0f" height="%.0f" viewBox="0 0 %.0f %.0f">'
            '<rect width="100%%" height="100%%" fill="%s"/>'
            '<g transform="translate(%.2f,%.2f) scale(1,-1)">%s</g></svg>'
            % (w, h, w, h, self.bg, ox, oy, body)
        )

    def flush(self):
        try:
            with open("turtle_output.svg", "w", encoding="utf-8") as f:
                f.write(self.svg())
        except Exception:
            pass


_canvas = _Canvas()
atexit.register(_canvas.flush)


class Turtle:
    def __init__(self):
        self.x = 0.0
        self.y = 0.0
        self.heading = 0.0
        self._visible = True
        self._speed = 3
        self._fill = None

    # --- 移动 ---
    def forward(self, d):
        rad = math.radians(self.heading)
        self._move(self.x + d * math.cos(rad), self.y + d * math.sin(rad))

    fd = forward

    def backward(self, d):
        self.forward(-d)

    bk = backward
    back = backward

    def right(self, a):
        self.heading = (self.heading - a) % 360

    rt = right

    def left(self, a):
        self.heading = (self.heading + a) % 360

    lt = left

    def goto(self, x, y=None, **kw):
        if y is None and hasattr(x, "__iter__"):
            x, y = x
        self._move(float(x), float(y))

    setpos = setposition = goto

    def setx(self, x):
        self._move(float(x), self.y)

    def sety(self, y):
        self._move(self.x, float(y))

    def setheading(self, a):
        self.heading = float(a) % 360

    seth = setheading

    def home(self):
        self.goto(0, 0)
        self.heading = 0.0

    def _move(self, nx, ny):
        if _canvas.pen_down:
            _canvas.line(self.x, self.y, nx, ny, _canvas.pen_color, _canvas.width)
        self.x, self.y = nx, ny
        if self._fill is not None:
            self._fill.append((nx, ny))

    def xcor(self):
        return self.x

    def ycor(self):
        return self.y

    def pos(self):
        return (self.x, self.y)

    position = pos

    def heading_deg(self):
        return self.heading

    def distance(self, x, y=None):
        if y is None:
            x, y = x
        return math.hypot(self.x - x, self.y - y)

    # --- 画笔 ---
    def penup(self):
        _canvas.pen_down = False

    pu = up = penup

    def pendown(self):
        _canvas.pen_down = True

    pd = down = pendown

    def isdown(self):
        return _canvas.pen_down

    def pencolor(self, *args):
        _canvas.pen_color = _c(args[0] if len(args) == 1 else args)

    color = pencolor

    def fillcolor(self, *args):
        _canvas.fill_color = _c(args[0] if len(args) == 1 else args)

    def pensize(self, w=1):
        if w is not None:
            _canvas.width = max(0.5, float(w))

    width = pensize

    def begin_fill(self):
        self._fill = [(self.x, self.y)]

    def end_fill(self):
        if self._fill and len(self._fill) > 2:
            pts = " ".join("%.2f,%.2f" % p for p in self._fill)
            _canvas.items.insert(
                len(_canvas.items),
                '<polygon points="%s" fill="%s" opacity="0.9"/>' % (pts, _canvas.fill_color),
            )
        self._fill = None

    def circle(self, radius, extent=360, steps=None):
        r = float(radius)
        ext = float(extent)
        n = steps or max(12, int(abs(ext) / 6))
        cx = self.x + r * math.cos(math.radians(self.heading + 90))
        cy = self.y + r * math.sin(math.radians(self.heading + 90))
        a0 = math.degrees(math.atan2(self.y - cy, self.x - cx))
        for i in range(1, n + 1):
            a = math.radians(a0 - ext * i / n * (1 if r > 0 else -1) * (1 if r > 0 else 1))
            a = math.radians(a0 - ext * i / n)
            self._move(cx + abs(r) * math.cos(a), cy + abs(r) * math.sin(a))
        self.heading = (self.heading - ext) % 360

    def dot(self, size=10, *color):
        col = _c(color[0]) if color else _canvas.pen_color
        _canvas.dot(self.x, self.y, float(size) / 2, col)

    def write(self, text, move=False, align="left", font=("Arial", 12, "normal")):
        size = font[1] if isinstance(font, (tuple, list)) and len(font) > 1 else 12
        _canvas.text(self.x, self.y, text, _canvas.pen_color, size)

    def speed(self, *a):
        self._speed = a[0] if a else 3

    def hideturtle(self):
        self._visible = False

    ht = hideturtle

    def showturtle(self):
        self._visible = True

    st = showturtle

    def shape(self, *a):
        pass

    def stamp(self):
        pass

    def clone(self):
        return Turtle()

    def clear(self):
        _canvas.items.clear()

    def reset(self):
        _canvas.items.clear()
        self.home()

    def done(self):
        _canvas.flush()

    mainloop = done


class Screen:
    def __init__(self):
        self._title = "turtle"

    def setup(self, width=480, height=360, *a, **kw):
        pass

    def bgcolor(self, *args):
        _canvas.bg = _c(args[0] if len(args) == 1 else args)

    def title(self, t=""):
        self._title = t

    def tracer(self, *a, **kw):
        pass

    def update(self):
        pass

    def delay(self, *a):
        pass

    def bye(self):
        pass

    def exitonclick(self):
        _canvas.flush()

    def mainloop(self):
        _canvas.flush()

    def listen(self, *a):
        pass

    def onkey(self, *a, **kw):
        pass

    def onclick(self, *a, **kw):
        pass


_default = Turtle()


def forward(d): _default.forward(d)
fd = forward
def backward(d): _default.backward(d)
bk = backward
def right(a): _default.right(a)
rt = right
def left(a): _default.left(a)
lt = left
def goto(x, y=None): _default.goto(x, y)
setpos = setposition = goto
def setheading(a): _default.setheading(a)
seth = setheading
def home(): _default.home()
def penup(): _default.penup()
pu = up = penup
def pendown(): _default.pendown()
pd = down = pendown
def pencolor(*a): _default.pencolor(*a)
color = pencolor
def fillcolor(*a): _default.fillcolor(*a)
def pensize(w=1): _default.pensize(w)
width = pensize
def begin_fill(): _default.begin_fill()
def end_fill(): _default.end_fill()
def circle(r, extent=360, steps=None): _default.circle(r, extent, steps)
def dot(size=10, *c): _default.dot(size, *c)
def write(t, move=False, align="left", font=("Arial", 12, "normal")): _default.write(t, move, align, font)
def speed(*a): _default.speed(*a)
def hideturtle(): _default.hideturtle()
ht = hideturtle
def showturtle(): _default.showturtle()
st = showturtle
def xcor(): return _default.xcor()
def ycor(): return _default.ycor()
def pos(): return _default.pos()
def heading(): return _default.heading
def clear(): _default.clear()
def reset(): _default.reset()
def done(): _canvas.flush()
mainloop = done
def bgcolor(*a): Screen().bgcolor(*a)
