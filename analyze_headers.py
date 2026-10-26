import re

with open('exported_chat.txt', 'r', encoding='utf-8') as f:
    text = f.read()

lines = text.split('\n')
patterns = {}
for line in lines:
    clean = re.sub(r'^\d{1,2}\.\d{1,2}\.\d{4}.*?-\s+[^:]+:\s*', '', line).strip()
    clean = re.sub(r'[*_~`]', '', clean).strip()
    m = re.match(r'^([א-ת\s"\'\-]{2,30}?)\s+(\d{2,3})\s*(?:שח|ש"ח|שקל|ש)?(?:\s|$)', clean)
    if m:
        route = m.group(1).strip()
        words = route.split()
        if 1 <= len(words) <= 3:
            patterns[route] = patterns.get(route, 0) + 1

sorted_p = sorted(patterns.items(), key=lambda x: x[1], reverse=True)
print("Top 100 route headers in real dispatches:")
for r, count in sorted_p[:100]:
    print(f'{count:4d} : {r}')
