"""Bounded, short-lived extraction cache; signed source URLs never leave RAM."""
import copy
import threading
import time
from collections import OrderedDict


class SourceCache:
    def __init__(self, ttl=300, max_bytes=48 * 1024 * 1024, max_entries=24):
        self.ttl, self.max_bytes, self.max_entries = ttl, max_bytes, max_entries
        self.entries = OrderedDict()
        self.lock = threading.RLock()

    def get(self, key):
        with self.lock:
            self._expire()
            entry = self.entries.get(key)
            if entry is None:
                return None
            self.entries.move_to_end(key)
            return copy.deepcopy(entry[1])

    def put(self, key, value, size):
        if size > self.max_bytes:
            return
        with self.lock:
            self._expire()
            self.entries[key] = (time.monotonic() + self.ttl, copy.deepcopy(value), size)
            self.entries.move_to_end(key)
            while len(self.entries) > self.max_entries or sum(e[2] for e in self.entries.values()) > self.max_bytes:
                self.entries.popitem(last=False)

    def remove(self, key):
        with self.lock:
            self.entries.pop(key, None)

    def _expire(self):
        now = time.monotonic()
        for key in [k for k, v in self.entries.items() if v[0] <= now]:
            del self.entries[key]
