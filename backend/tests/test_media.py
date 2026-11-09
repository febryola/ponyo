from app.media import storefront_image_url


def test_catalog_media_always_resolves_to_premier_local_assets():
    assert storefront_image_url("https://cdn.example.com/files/maker-bunny.jpg?v=123") == "/images/catalog/maker-bunny.jpg"
    assert storefront_image_url("/images/catalog/ponyo-6.png") == "/images/catalog/ponyo-6.png"


def test_unknown_external_media_uses_local_storefront_fallback():
    assert storefront_image_url("https://untrusted.example/image.jpg") == "/images/catalog/ponyo-2.png"
