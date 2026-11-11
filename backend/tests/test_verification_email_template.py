from email import policy
from email.parser import BytesParser
from html.parser import HTMLParser

from app.email_notifications import build_verification_message


class EmailHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.images = []
        self.text = []
        self.tags = []

    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)
        if tag == "a":
            self.links.append(dict(attrs))
        if tag == "img":
            self.images.append(dict(attrs))

    def handle_data(self, data):
        self.text.append(data)


def test_verification_email_has_branded_html_button_and_embedded_mascot():
    url = "https://shop.example.test/account/verify-email?token=secure-test&source=email"
    message = build_verification_message("accounts@example.test", "buyer@example.test", url)
    # Check what actually travels over SMTP, including encoding/MIME boundaries.
    delivered = BytesParser(policy=policy.default).parsebytes(message.as_bytes())
    assert delivered.get_content_type() == "multipart/alternative"
    assert delivered["From"].addresses[0].display_name == "Ponyo"
    assert delivered["To"].addresses[0].addr_spec == "buyer@example.test"
    plain = delivered.get_body(preferencelist=("plain",)).get_content()
    html = delivered.get_body(preferencelist=("html",)).get_content()
    assert url in plain
    parsed = EmailHTML()
    parsed.feed(html)
    assert [link["href"] for link in parsed.links] == [url]
    visible = "".join(parsed.text)
    assert "Verify Email Address" in visible
    assert "PONYO" in visible and "buyer@example.test" in visible
    assert "24 hours" in visible and "once" in visible
    assert url not in visible
    assert "background-color:#ed713d" in html
    image = next(part for part in delivered.walk() if part.get_content_type() == "image/png")
    assert image.get_content_disposition() == "inline"
    assert image.get_payload(decode=True).startswith(b"\x89PNG\r\n\x1a\n")
    assert parsed.images[0]["src"] == "cid:" + image["Content-ID"][1:-1]
    assert parsed.images[0]["alt"] == "Ponyo jellyfish"
    assert not any(item["src"].startswith(("http:", "https:", "data:")) for item in parsed.images)
    related = next(part for part in delivered.walk() if part.get_content_type() == "multipart/related")
    assert related.get_param("type") == "text/html"
    assert related.get_param("start") == delivered.get_body(preferencelist=("html",))["Content-ID"]


def test_public_email_uses_https_png_and_clickable_button():
    url = "https://shop.example.test/account/verify-email?token=secure-test"
    logo_url = "https://shop.example.test/ponyo-email-jellyfish.png"
    message = build_verification_message("accounts@example.test", "buyer@example.test", url, logo_url=logo_url)
    delivered = BytesParser(policy=policy.default).parsebytes(message.as_bytes())
    parsed = EmailHTML()
    parsed.feed(delivered.get_body(preferencelist=("html",)).get_content())
    assert parsed.images[0]["src"] == logo_url
    assert parsed.links[0]["href"] == url
    assert parsed.links[0]["target"] == "_blank"
    assert "display:block" in parsed.links[0]["style"]
    assert not any(part.get_content_type() == "image/png" for part in delivered.walk())
    assert url in delivered.get_body(preferencelist=("plain",)).get_content()


def test_verification_html_escapes_dynamic_content():
    url = 'https://shop.example.test/account/verify-email?token=test&label="value"'
    message = build_verification_message("accounts@example.test", "<b>buyer</b>@example.test", url)
    html = message.get_body(preferencelist=("html",)).get_content()
    parsed = EmailHTML()
    parsed.feed(html)
    assert parsed.links[0]["href"] == url
    assert "b" not in parsed.tags
    assert "&lt;b&gt;buyer&lt;/b&gt;" in html