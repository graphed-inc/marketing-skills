"""Spell out numbers and symbols so a TTS or a video model has nothing to misread.
24/7 -> twenty-four seven, 2am -> two a.m., 95% -> ninety-five percent, $500/month -> five hundred dollars a month."""
import re

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def num_words(n: int) -> str:
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")
    if n < 1000:
        return ONES[n // 100] + " hundred" + (" " + num_words(n % 100) if n % 100 else "")
    if n < 1_000_000:
        return num_words(n // 1000) + " thousand" + (" " + num_words(n % 1000) if n % 1000 else "")
    return str(n)


def speakable(text: str) -> str:
    """Spell out digits and symbols so the model has nothing to misread: 24/7, 2am, 95%, $500, 10."""
    t = re.sub(r"\b24\s*/\s*7\b", "twenty-four seven", text)
    t = re.sub(r"\b365\s*/\s*24\s*/\s*7\b", "three sixty-five, twenty-four seven", t)

    def clock(m):
        h, mins, ap = int(m.group(1)), m.group(2), m.group(3).lower().replace(".", "")
        out = num_words(h) if not mins else f"{num_words(h)} {'oh ' + num_words(int(mins)) if mins.startswith('0') else num_words(int(mins))}"
        return f"{out} {ap[0]}.m."
    t = re.sub(r"\b(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)(?![a-z])", clock, t, flags=re.I)
    # a bare clock time with no a.m./p.m. ("by 9:46") would otherwise come out "nine:forty-six"
    t = re.sub(r"\b(\d{1,2}):(\d{2})\b", lambda m: f"{num_words(int(m.group(1)))} " +
               (f"oh {ONES[int(m.group(2))]}" if m.group(2).startswith("0") and m.group(2) != "00" else
                ("o'clock" if m.group(2) == "00" else num_words(int(m.group(2))))), t)
    t = re.sub(r"/\s*(month|mo|year|yr|week|wk|day|hour|hr)\b",
               lambda m: " a " + {"mo": "month", "yr": "year", "wk": "week", "hr": "hour"}.get(m.group(1).lower(), m.group(1).lower()), t, flags=re.I)
    def year(m):
        c, y = m.group(1), int(m.group(2))
        if c == "20" and y < 10:
            return "two thousand" + (" " + ONES[y] if y else "")
        return f"{num_words(int(c))} {'hundred' if y == 0 else ('oh ' + ONES[y] if y < 10 else num_words(y))}"
    t = re.sub(r"\b(19|20)(\d{2})\b", year, t)
    t = re.sub(r"\$(\d[\d,]*)(k\b)?", lambda m: num_words(int(m.group(1).replace(",", "")) * (1000 if m.group(2) else 1)) + " dollars", t, flags=re.I)
    t = re.sub(r"\b(\d[\d,]*)\s*%", lambda m: num_words(int(m.group(1).replace(",", ""))) + " percent", t)
    t = re.sub(r"\b(\d{1,3}(?:,\d{3})+|\d{1,6})\b(?!\.\d)", lambda m: num_words(int(m.group(1).replace(",", ""))), t)
    return t
