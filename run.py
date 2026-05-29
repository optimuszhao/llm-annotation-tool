import uvicorn

from backend.app import app
from backend.database import init_db


if __name__ == "__main__":
    init_db(recover_interrupted=True)
    uvicorn.run(app, host="127.0.0.1", port=8000)
