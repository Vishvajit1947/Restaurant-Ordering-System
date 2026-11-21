from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, PlainSerializer

# Money is serialised as a string with exactly two decimals ("249.00") so no precision is lost in JSON.
Money = Annotated[Decimal, PlainSerializer(lambda v: f"{v:.2f}", return_type=str, when_used="json")]

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class StrictInput(BaseModel):
    """Request bodies reject unknown fields, so a client cannot smuggle in prices, roles, totals, etc."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int


class Message(BaseModel):
    message: str
