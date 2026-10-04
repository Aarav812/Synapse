from html.parser import HTMLParser

class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        
    def handle_starttag(self, t, a):
        if t not in ['input', 'img', 'br', 'hr', 'link', 'meta', 'path']:
            self.stack.append(t)
            
    def handle_endtag(self, t):
        if t in ['input', 'img', 'br', 'hr', 'link', 'meta', 'path']:
            return
        if not self.stack:
            print(f"Extra closing tag: {t}")
            return
        top = self.stack.pop()
        if top != t:
            print(f"Mismatched tag: expected {top}, got {t}")

p = P()
p.feed(open('c:/Users/Aarav/Documents/Synapse-main/frontend/chat.html').read())
if p.stack:
    print(f"Unclosed tags remaining: {p.stack}")
else:
    print("All tags matched perfectly!")
