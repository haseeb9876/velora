"""Small document store shared by local SQLite and optional Neon Postgres."""
import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from config import DATA

class Store:
    def __init__(self):
        self.lock = threading.RLock()
        self.pool = None
        if os.getenv('DATABASE_URL'):
            from psycopg_pool import ConnectionPool
            self.pool = ConnectionPool(os.environ['DATABASE_URL'], min_size=0, max_size=4, max_idle=60, timeout=15, check=ConnectionPool.check_connection, kwargs={'connect_timeout': 10})
        else:
            self.db = sqlite3.connect(DATA / 'velora.sqlite3', check_same_thread=False)
            self.db.execute('PRAGMA journal_mode=WAL')
        with self.connection() as conn:
            conn.execute('CREATE TABLE IF NOT EXISTS velora_documents (id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner TEXT NOT NULL, payload TEXT NOT NULL, expires DOUBLE PRECISION NOT NULL)')
            conn.execute('CREATE INDEX IF NOT EXISTS velora_documents_owner ON velora_documents (kind, owner)')

    @contextmanager
    def connection(self):
        if self.pool:
            with self.pool.connection() as conn:
                yield conn
        else:
            with self.lock, self.db:
                yield self.db

    def execute(self, conn, sql, args=()):
        return conn.execute(sql.replace('?', '%s') if self.pool else sql, args)

    def put(self, kind, owner, item, expires):
        with self.connection() as conn:
            self.execute(conn, 'INSERT INTO velora_documents (id,kind,owner,payload,expires) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,expires=excluded.expires', (item['id'], kind, owner, json.dumps(item), expires))

    def get(self, id, kind, owner=None):
        with self.connection() as conn:
            row = self.execute(conn, 'SELECT owner,payload FROM velora_documents WHERE id=? AND kind=? AND expires>?', (id, kind, time.time())).fetchone()
        if not row or (owner is not None and row[0] != owner):
            return None
        return json.loads(row[1])

    def list(self, kind, owner=None, include_expired=False):
        sql = 'SELECT payload FROM velora_documents WHERE kind=?'
        args = [kind]
        if owner is not None:
            sql += ' AND owner=?'
            args.append(owner)
        if not include_expired:
            sql += ' AND expires>?'
            args.append(time.time())
        with self.connection() as conn:
            rows = self.execute(conn, sql, args).fetchall()
        return [json.loads(r[0]) for r in rows]

    def cleanup(self):
        with self.connection() as conn:
            self.execute(conn, 'DELETE FROM velora_documents WHERE expires<?', (time.time(),))

    def close(self):
        if self.pool:
            self.pool.close()
        else:
            self.db.close()
