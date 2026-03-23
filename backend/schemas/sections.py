from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SectionCreate(BaseModel):
    title: str
    color: str | None = None
    order_index: int | None = None
    is_published: bool = True


class SectionUpdate(BaseModel):
    title: str | None = None
    color: str | None = None
    order_index: int | None = None
    is_published: bool | None = None


class SectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    color: str | None = None
    order_index: int | None = None
    is_published: bool
    created_at: datetime | None = None
