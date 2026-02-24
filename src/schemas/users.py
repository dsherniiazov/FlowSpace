from pydantic import BaseModel, ConfigDict


class UserCreate(BaseModel):
    email: str
    name: str
    last_name: str
    password: str


class UserUpdate(BaseModel):
    email: str | None = None
    name: str | None = None
    last_name: str | None = None
    password: str | None = None
    is_admin: bool | None = None


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    last_name: str
    is_admin: bool = False
    avatar_path: str | None = None


class UserAdminUpdate(BaseModel):
    is_admin: bool


class UserPasswordChange(BaseModel):
    current_password: str
    new_password: str
