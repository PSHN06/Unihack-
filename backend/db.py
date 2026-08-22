from typing import Optional
from sqlmodel import Field, Session, SQLModel, create_engine

sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, echo=False, connect_args=connect_args)

class Job(SQLModel, table=True):
    job_id: str = Field(primary_key=True)
    status: str
    created_at: float
    updated_at: float
    payload_json: str
    result_json: Optional[str] = None
    error: Optional[str] = None
    phases_json: str

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    return Session(engine)
