from pathlib import PurePosixPath
from urllib.parse import urlparse

# Only these locally vendored assets may be returned as catalog media.
LOCAL_CATALOG_IMAGES = {
    "maker-bear.jpg",
    "maker-bunny.jpg",
    "maker-cat.jpg",
    "maker-chick.jpg",
    "maker-cloud.jpg",
    "maker-dinosaur.jpg",
    "maker-dog.jpg",
    "maker-penguin.jpg",
    "maker-pink-bunny.jpg",
    "ponyo-11.png",
    "ponyo-12.png",
    "ponyo-2.png",
    "ponyo-3.png",
    "ponyo-5.png",
    "ponyo-6.png",
    "ponyo-7.png",
}


def storefront_image_url(value: str | None) -> str:
    """Resolve catalog images to Ponyo-hosted static assets, never a vendor CDN."""
    filename = PurePosixPath(urlparse(value or "").path).name
    if filename not in LOCAL_CATALOG_IMAGES:
        filename = "ponyo-2.png"
    return f"/images/catalog/{filename}"
