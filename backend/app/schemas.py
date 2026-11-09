import base64
import binascii
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class VariantOut(BaseModel):
    id: str
    sku: str
    title: str
    priceAmount: int
    currency: str
    compareAtAmount: int | None = None
    availability: str
    options: dict[str, str] = Field(default_factory=dict)


class PriceHistoryEntry(BaseModel):
    date: str
    price: int = Field(ge=0)


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    sku: str
    slug: str
    name: str
    description: str
    priceAmount: int = Field(validation_alias="price_amount")
    compareAtAmount: int | None = Field(default=None, validation_alias="compare_at_amount")
    currency: str
    availability: str
    availabilityStatus: str | None = Field(default=None, validation_alias="availability_status")
    priceHistory: list[PriceHistoryEntry] = Field(default_factory=list, validation_alias="price_history")
    variantId: str | None = None
    categoryName: str = Field(validation_alias="category_name")
    productType: str | None = Field(default=None, validation_alias="product_type")
    supplierName: str = Field(validation_alias="supplier_name")
    image: str = Field(validation_alias="image_url")
    imageAlt: str = Field(validation_alias="image_alt")
    tags: list[str] = Field(default_factory=list)
    sizeTier: str | None = Field(default=None, validation_alias="size_tier")
    dimensions: str | None = None
    dispatchTime: str | None = Field(default=None, validation_alias="dispatch_time")
    variants: list[VariantOut] = Field(default_factory=list)


class ProductListOut(BaseModel):
    data: list[ProductOut]
    page: int
    limit: int
    total: int


class AuthCredentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RegisterRequest(AuthCredentials):
    firstName: str = Field(min_length=1, max_length=120)
    lastName: str = Field(default="", max_length=120)
    marketingOptIn: bool = False

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: str) -> str:
        if not any(character.isdigit() for character in password):
            raise ValueError("Password must include at least one number.")
        if not any(not character.isalnum() for character in password):
            raise ValueError("Password must include at least one special character.")
        return password


class CustomerOut(BaseModel):
    id: UUID
    firstName: str
    lastName: str
    email: EmailStr


class CustomerProfileOut(CustomerOut):
    pass


class CustomerProfileUpdate(BaseModel):
    firstName: str = Field(min_length=1, max_length=120)
    lastName: str = Field(default="", max_length=120)


class CustomerAddressInput(BaseModel):
    firstName: str = Field(min_length=1, max_length=120)
    lastName: str = Field(min_length=1, max_length=120)
    address1: str = Field(min_length=1, max_length=240)
    address2: str = Field(default="", max_length=240)
    city: str = Field(min_length=1, max_length=120)
    region: str = Field(default="", max_length=120)
    postalCode: str = Field(min_length=1, max_length=40)
    countryCode: str = Field(min_length=2, max_length=2)
    phone: str = Field(default="", max_length=40)
    isDefault: bool = False


class CustomerAddressOut(CustomerAddressInput):
    id: UUID


class WishlistUpdate(BaseModel):
    productSlugs: list[str] = Field(default_factory=list, max_length=200)


class ProductReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str = Field(default="", max_length=140)
    body: str = Field(default="", max_length=3000)
    photos: list[str] = Field(default_factory=list, max_length=4)

    @field_validator("photos")
    @classmethod
    def validate_photos(cls, photos: list[str]) -> list[str]:
        for photo in photos:
            if len(photo) > 550_000 or not photo.startswith("data:image/jpeg;base64,"):
                raise ValueError("Review photos must be optimized JPEG images under 400 KB each.")
            try:
                image_bytes = base64.b64decode(photo.partition(",")[2], validate=True)
            except (binascii.Error, ValueError):
                raise ValueError("One of the review photos is invalid.") from None
            if len(image_bytes) > 400_000 or not image_bytes.startswith(b"\xff\xd8\xff"):
                raise ValueError("Review photos must be valid JPEG images under 400 KB each.")
        return photos


class ProductWaitlistRequest(BaseModel):
    email: EmailStr
    firstName: str = Field(default="", max_length=120)


class CustomerEnvelope(BaseModel):
    customer: CustomerOut


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=128)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: str) -> str:
        if not any(character.isdigit() for character in password):
            raise ValueError("Password must include at least one number.")
        if not any(not character.isalnum() for character in password):
            raise ValueError("Password must include at least one special character.")
        return password


class AcceptedOut(BaseModel):
    accepted: bool = True


class OrderItemOut(BaseModel):
    id: str
    name: str
    image: str
    imageAlt: str = ""
    maker: str = "Ponyo"
    quantity: int
    unitPrice: int
    currency: str


class OrderOut(BaseModel):
    id: UUID
    orderNumber: str
    createdAt: datetime
    status: str
    paymentStatus: str
    fulfillmentStatus: str
    customerEmail: EmailStr
    deliveryAddress: str
    trackingNumber: str | None = None
    trackingCarrier: str | None = None
    totalAmount: int
    currency: str
    items: list[OrderItemOut]


class CheckoutAddress(BaseModel):
    firstName: str = Field(min_length=1, max_length=120)
    lastName: str = Field(min_length=1, max_length=120)
    address1: str = Field(min_length=1, max_length=240)
    address2: str = Field(default="", max_length=240)
    region: str = Field(min_length=1, max_length=120)
    city: str = Field(min_length=1, max_length=120)
    postalCode: str = Field(min_length=1, max_length=40)
    countryCode: str = Field(min_length=2, max_length=2)
    phone: str = Field(min_length=1, max_length=40)


class CheckoutItem(BaseModel):
    variantId: UUID
    quantity: int = Field(gt=0, le=50)


class CheckoutSessionRequest(BaseModel):
    email: EmailStr
    shippingAddress: CheckoutAddress
    shippingMethod: str = Field(min_length=1, max_length=64)
    paymentMethod: Literal["card", "paypal", "apple_pay"]
    currency: str = Field(default="JPY", min_length=3, max_length=3)
    items: list[CheckoutItem] = Field(min_length=1, max_length=40)
    successUrl: str
    cancelUrl: str


class CheckoutSessionOut(BaseModel):
    checkoutUrl: str
    orderId: UUID
    expiresAt: datetime


class CheckoutReceiptOut(BaseModel):
    orderId: UUID
    orderNumber: str
    status: str
    paymentStatus: str
    fulfillmentStatus: str
    totalAmount: int
    currency: str


class NewsletterRequest(BaseModel):
    email: EmailStr


class ContactRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    message: str = Field(min_length=1, max_length=5000)
    requestType: str | None = Field(default=None, max_length=80)
