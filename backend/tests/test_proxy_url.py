import pytest

from app.routers.proxy import is_allowed_image_url


@pytest.mark.parametrize("url", [
    "https://scontent-ist1-1.cdninstagram.com/v/t51/abc.jpg",
    "https://instagram.fist1-1.fna.fbcdn.net/x.jpg",
    "https://cdninstagram.com/a.jpg",
])
def test_allows_instagram_cdn(url):
    assert is_allowed_image_url(url)


@pytest.mark.parametrize("url", [
    "http://scontent.cdninstagram.com/a.jpg",                 # http
    "https://evilcdninstagram.com/a.jpg",                     # soneki taklidi
    "https://cdninstagram.com.evil.com/a.jpg",                # alt alan adı taklidi
    "http://127.0.0.1:6379/?scontent",                        # SSRF: eski alt dize kontrolünü geçerdi
    "https://evil.com/?u=cdninstagram.com",
    "https://user:pw@scontent.cdninstagram.com/a.jpg",        # kimlik bilgisi
    "https://scontent.cdninstagram.com:8443/a.jpg",           # farklı port
    "file:///etc/passwd",
    "",
])
def test_blocks_everything_else(url):
    assert not is_allowed_image_url(url)
