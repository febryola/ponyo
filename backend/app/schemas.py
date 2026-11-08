from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class VariantOut(BaseModel):
    id: str
    title: str
    priceAmount: int
    currency: str
    compareAtAmount: int | None = None
    availability: str


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    slug: str
    name: str
    description: str
    priceAmount: int = Field(validation_alias="price_amount")
    compareAtAmount: int | None = Field(default=None, validation_alias="compare_at_amount")
    currency: str
    availability: str
    availabilityStatus: str | None = Field(default=None, validation_alias="availability_status")
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


class CustomerOut(BaseModel):
    id: UUID
    firstName: str
    lastName: str
    email: EmailStr


class CustomerProfileOut(CustomerOut):
    pass


class CustomerEnvelope(BaseModel):
    customer: CustomerOut


class PasswordResetRequest(BaseModel):
    email: EmailStr


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
    totalAmount: int
    currency: str
    items: list[OrderItemOut]


class CheckoutAddress(BaseModel):
    firstName: str = Field(min_length=1, max_length=120)
    lastName: str = Field(min_length=1, max_length=120)
    address1: str = Field(min_length=1, max_length=240)
    city: str = Field(min_length=1, max_length=120)
    postalCode: str = Field(min_length=1, max_length=40)
    countryCode: str = Field(min_length=2, max_length=2)


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
